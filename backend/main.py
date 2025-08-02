import os
import logging
import asyncio
import json
from dotenv import load_dotenv

# Cargar variables de entorno ANTES de cualquier otra importación del proyecto
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from celery import Celery, group, chord
from pydantic import BaseModel
from playwright.async_api import async_playwright

# Importar nuestros módulos de scraping
from scraper import crawler, browser, extractor
from . import database
from scraper import storage

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# --- Configuración de Celery ---
# Usar el nombre del servicio Docker 'redis' en lugar de 'localhost'
celery_app = Celery("tasks", broker="redis://redis:6379/0", backend="redis://redis:6379/0")
celery_app.conf.update(
    task_track_started=True,
    result_extended=True
)

# --- Aplicación FastAPI ---
app = FastAPI(title="Scraper API", version="1.0.0")
database.init_db()

# --- Configuración de CORS ---
# Permite que el frontend (servido desde un archivo local) se comunique con la API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todos los orígenes (cuidado en producción)
    allow_credentials=False,
    allow_methods=["*"],  # Permite todos los métodos (GET, POST, etc.)
    allow_headers=["*"],  # Permite todas las cabeceras
)

class ScrapeRequest(BaseModel):
    domains: list[str]

# --- Tareas de Celery ---

@celery_app.task(name="process_url_task", bind=True, acks_late=True, max_retries=2)
def process_url_task(self, job_id: str, url: str):
    """Tarea síncrona que envuelve la lógica asíncrona de scraping."""
    return asyncio.run(scrape_single_url(self, job_id, url))

async def scrape_single_url(task_self, job_id: str, url: str):
    """Lógica asíncrona real para procesar una única URL."""
    logging.info(f"[URL Task] Iniciando procesamiento de: {url}")
    job = database.get_job(job_id)
    if not job or job.status != "RUNNING":
        logging.info(f"[URL Task] Job {job_id} no activo. Saltando {url}")
        return {"url": url, "status": "skipped"}
    try:
        async with async_playwright() as pw:
            pw_browser = await pw.chromium.launch(headless=True)
            context = await pw_browser.new_context(user_agent=browser.HEADERS['User-Agent'])

            html = await browser.get_html_from_url(context, url)
            if not html:
                storage.save_product(job_id, url, {"reason": "No se pudo obtener HTML"}, "failed")
                return {"url": url, "status": "failed", "reason": "No se pudo obtener HTML"}

            product_data = await extractor.extract_product_data_from_html(url, html)
            if not product_data:
                storage.save_product(job_id, url, {"reason": "No se pudieron extraer datos"}, "failed")
                return {"url": url, "status": "failed", "reason": "No se pudieron extraer datos"}

            # Guardar en archivo y base de datos
            with open("results.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(product_data, ensure_ascii=False) + "\n")
            storage.save_product(job_id, url, product_data, "success")

            await pw_browser.close()
            return {"url": url, "status": "success", "data": product_data['title']}
    except Exception as e:
        logging.exception(f"[URL Task] Falla catastrófica en {url}: {e}")
        task_self.update_state(state='FAILURE', meta=str(e))
        raise


@celery_app.task(name="finalize_scraping_task", bind=True)
def finalize_scraping_task(self, results, job_id: str):
    """Tarea que se ejecuta al finalizar todas las subtareas."""
    total = len(results)
    success = sum(1 for r in results if r and r.get("status") == "success")
    database.update_job_status(job_id, "COMPLETED")
    logging.info(
        f"[Finalize] Job {job_id} completado. {success}/{total} URLs procesadas exitosamente."
    )
    return {
        "status": "Completed",
        "total_urls_processed": total,
        "products_found": success,
    }

@celery_app.task(name="start_scraping_task", bind=True)
def start_scraping_task(self, domains: list[str]):
    """Tarea principal síncrona que orquesta el scraping de dominios."""
    # Usar el bucle de eventos existente en lugar de asyncio.run() para evitar conflictos
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(orchestrate_scraping(self, domains))

async def orchestrate_scraping(task_self, domains: list[str]):
    """Lógica de orquestación asíncrona para el scraping."""
    logging.info(f"[Main Task] Descubriendo URLs para: {domains}")
    
    try:
        url_lists = await asyncio.gather(
            *[crawler.get_urls_for_domain(domain) for domain in domains]
        )
        all_urls = [url for sublist in url_lists for url in sublist]

        if not all_urls:
            logging.warning("[Main Task] No se encontraron URLs para procesar.")
            task_self.update_state(state="SUCCESS", meta={"status": "No URLs found"})
            return {"status": "No URLs found", "total": 0}

        total_urls = len(all_urls)
        job_id = task_self.request.id
        database.create_job(job_id, total_urls, all_urls)

        task_self.update_state(
            state="PROGRESS",
            meta={"total": total_urls, "status": "Descubriendo URLs..."},
        )
        logging.info(
            f"Se descubrieron {total_urls} URLs para los dominios: {domains}"
        )

        task_chord = chord(
            process_url_task.s(job_id, url) for url in all_urls
        )(finalize_scraping_task.s(job_id))
        database.update_job_group(job_id, task_chord.id)

        task_self.update_state(
            state="PROGRESS",
            meta={
                "task_group_id": task_chord.id,
                "total": total_urls,
                "status": "Procesando URLs...",
            },
        )
        logging.info(f"Grupo de tareas {task_chord.id} lanzado.")

        return {
            "status": "Started",
            "total_urls": total_urls,
            "task_group_id": task_chord.id,
        }
    except Exception as e:
        job_id = task_self.request.id
        logging.exception("[Main Task] Error durante la orquestación")
        database.update_job_status(job_id, "FAILED")
        task_self.update_state(state="FAILURE", meta={"error": str(e)})
        raise

# --- Endpoints de la API ---

@app.get("/", summary="Endpoint de prueba")
def read_root():
    return {"status": "ok", "message": "Bienvenido a la API de Scraper 2.0"}

@app.post("/scrape", summary="Iniciar un nuevo trabajo de scraping", status_code=202)
async def create_scraping_job(req: ScrapeRequest):
    if not req.domains:
        raise HTTPException(status_code=400, detail="La lista de dominios no puede estar vacía.")
    task = start_scraping_task.delay(req.domains)
    return {"message": "Trabajo de scraping iniciado", "task_id": task.id}


@app.get("/scrape/results/{task_id}", summary="Obtener resultados de un trabajo")
async def get_scraping_results(task_id: str):
    if not database.job_exists(task_id):
        raise HTTPException(status_code=404, detail="Job not found")
    results = database.get_results_by_job(task_id)
    return {"task_id": task_id, "results": results}

@app.get("/scrape/status/{task_id}", summary="Consultar estado de un trabajo")
async def get_scraping_status(task_id: str):
    job = database.get_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    results = database.get_results_by_job(task_id)
    success = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "failed")
    completed = success + failed
    percent = (completed / job.total_urls * 100) if job.total_urls else 0

    error_detail = None
    if job.status == "FAILED":
        async_result = celery_app.AsyncResult(task_id)
        error_detail = str(async_result.info)

    return {
        "task_id": task_id,
        "status": job.status,
        "progress": {
            "total": job.total_urls,
            "completed": completed,
            "success": success,
            "failed": failed,
            "percent": f"{percent:.2f}%",
        },
        "error": error_detail,
    }


@app.post("/scrape/pause/{task_id}", summary="Pausar un trabajo en ejecución")
async def pause_job(task_id: str):
    job = database.get_job(task_id)
    if not job or job.status != "RUNNING":
        raise HTTPException(status_code=400, detail="Job not running")
    if job.task_group_id:
        group_result = celery_app.GroupResult.restore(job.task_group_id)
        if group_result:
            for child in group_result.children:
                celery_app.control.revoke(child.id, terminate=True)
    database.update_job_status(task_id, "PAUSED")
    return {"status": "paused"}


@app.post("/scrape/resume/{task_id}", summary="Reanudar un trabajo pausado")
async def resume_job(task_id: str):
    job = database.get_job(task_id)
    if not job or job.status != "PAUSED":
        raise HTTPException(status_code=400, detail="Job not paused")
    pending = database.get_pending_urls(task_id)
    if not pending:
        database.update_job_status(task_id, "COMPLETED")
        return {"status": "completed"}
    tasks_group = group(process_url_task.s(task_id, url) for url in pending)
    result_group = tasks_group.apply_async()
    database.update_job_group(task_id, result_group.id)
    database.update_job_status(task_id, "RUNNING")
    return {"status": "resumed", "pending": len(pending)}


@app.post("/scrape/stop/{task_id}", summary="Cancelar un trabajo")
async def stop_job(task_id: str):
    job = database.get_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.task_group_id:
        group_result = celery_app.GroupResult.restore(job.task_group_id)
        if group_result:
            for child in group_result.children:
                celery_app.control.revoke(child.id, terminate=True)
    database.update_job_status(task_id, "CANCELLED")
    return {"status": "cancelled"}


@app.delete("/scrape/{task_id}", summary="Eliminar un trabajo y sus resultados")
async def delete_job(task_id: str):
    if not database.job_exists(task_id):
        raise HTTPException(status_code=404, detail="Job not found")
    database.delete_job(task_id)
    return {"status": "deleted"}


@app.get("/scrape/download/{task_id}", summary="Descargar resultados de un trabajo")
async def download_results(task_id: str):
    if not database.job_exists(task_id):
        raise HTTPException(status_code=404, detail="Job not found")
    results = database.get_results_by_job(task_id)
    return JSONResponse(content=results)
