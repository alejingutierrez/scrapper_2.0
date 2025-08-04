import os
import logging
import asyncio
import json
import subprocess
import math
from dotenv import load_dotenv

# Cargar variables de entorno ANTES de cualquier otra importación del proyecto
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, APIRouter
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

# Cada trabajo de scraping requiere tres procesos de worker por defecto. De este
# modo se puede ajustar con variables de entorno en despliegues diferentes, pero
# si no se especifica se garantizan tres workers por job como mínimo.
WORKERS_PER_JOB = int(os.getenv("WORKERS_PER_JOB", "3"))
# Cada contenedor de worker ejecuta también tres procesos de Celery por defecto
# para que el número total de procesos coincida con el multiplicador anterior.
WORKER_CONTAINER_CONCURRENCY = int(os.getenv("WORKER_CONCURRENCY", "3"))


def scale_worker_containers() -> None:
    """Scale Celery worker containers based on running jobs.

    Each job requires ``WORKERS_PER_JOB`` worker processes. Docker containers
    are scaled so that each container provides ``WORKER_CONTAINER_CONCURRENCY``
    processes. Any error during scaling is logged but ignored to keep the
    scraping flow running even when Docker is unavailable (e.g. during tests).
    """
    active_jobs = database.count_jobs_by_status("RUNNING") + database.count_jobs_by_status("PENDING")
    required_workers = active_jobs * WORKERS_PER_JOB
    target_containers = (
        math.ceil(required_workers / WORKER_CONTAINER_CONCURRENCY)
        if required_workers
        else 0
    )
    try:  # pragma: no cover - depends on docker being available
        subprocess.run(
            [
                "docker",
                "compose",
                "up",
                "--scale",
                f"worker={target_containers}",
                "--force-recreate",
                "--remove-orphans",
                "-d",
            ],
            check=True,
        )
        logging.info("Scaled workers to %s containers", target_containers)
    except Exception as exc:  # pragma: no cover - best effort
        logging.warning("Could not scale workers: %s", exc)

# --- Configuración de CORS ---
# Permite que el frontend (servido desde un archivo local) se comunique con la API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todos los orígenes (cuidado en producción)
    allow_credentials=False,
    allow_methods=["*"],  # Permite todos los métodos (GET, POST, etc.)
    allow_headers=["*"],  # Permite todas las cabeceras
)


@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    """Garantiza cabeceras CORS incluso en respuestas de error."""
    try:
        response = await call_next(request)
    except HTTPException as exc:
        # Preserve FastAPI HTTP exceptions and status codes
        response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    except Exception as exc:  # pragma: no cover - protección ante errores inesperados
        logging.exception("Unhandled server error: %s", exc)
        response = JSONResponse({"detail": "Internal Server Error"}, status_code=500)
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "*")
    response.headers.setdefault("Access-Control-Allow-Methods", "*")
    return response

class ScrapeRequest(BaseModel):
    domains: list[str]

# The API endpoints are registered on an ``APIRouter`` which is mounted twice:
# at the application root (``/``) and under the ``/api`` prefix.  This allows
# the React frontend (which uses ``/api`` in production) and the unit tests
# (which call endpoints directly) to access the same handlers.
router = APIRouter()

# --- Tareas de Celery ---

@celery_app.task(name="process_url_task", bind=True, acks_late=True, max_retries=2)
def process_url_task(self, job_id: str, url: str):
    """Tarea síncrona que envuelve la lógica asíncrona de scraping."""
    return asyncio.run(scrape_single_url(self, job_id, url))

async def scrape_single_url(task_self, job_id: str, url: str):
    """Lógica asíncrona real para procesar una única URL."""
    logging.info(f"[URL Task] Iniciando procesamiento de: {url}")
    job = database.get_job(job_id)
    if not job or job["status"] != "RUNNING":
        logging.info(f"[URL Task] Job {job_id} no activo. Saltando {url}")
        return {"url": url, "status": "skipped"}
    try:
        async with async_playwright() as pw:
            pw_browser = await pw.chromium.launch(headless=True)
            context = await browser.create_context(pw_browser, proxy=os.getenv("SCRAPER_PROXY"))
            try:
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

                return {"url": url, "status": "success", "data": product_data['title']}
            finally:
                await context.close()
                await pw_browser.close()
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
    scale_worker_containers()
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
        scale_worker_containers()

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

@router.get("/", summary="Endpoint de prueba")
def read_root():
    return {"status": "ok", "message": "Bienvenido a la API de Scraper 2.0"}

@router.post("/scrape", summary="Iniciar un nuevo trabajo de scraping", status_code=202)
async def create_scraping_job(req: ScrapeRequest):
    if not req.domains:
        raise HTTPException(status_code=400, detail="La lista de dominios no puede estar vacía.")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY not configured")
    try:
        task = start_scraping_task.delay(req.domains)
    except Exception as exc:  # pragma: no cover - depende del entorno externo
        logging.exception("No se pudo encolar la tarea de scraping: %s", exc)
        raise HTTPException(
            status_code=503, detail="Scraping service unavailable"
        ) from exc

    # Registrar inmediatamente el job en la base de datos para que el
    # frontend pueda consultar su estado sin esperar a que Celery descubra
    # las URLs. El número total y la lista de URLs se actualizarán una vez que
    # la tarea principal haya terminado la fase de descubrimiento.
    database.create_job(task.id, status="PENDING")
    scale_worker_containers()

    return {"message": "Trabajo de scraping iniciado", "task_id": task.id}


@router.get("/scrape/results/{task_id}", summary="Obtener resultados de un trabajo")
async def get_scraping_results(task_id: str):
    if not database.job_exists(task_id):
        raise HTTPException(status_code=404, detail="Job not found")
    results = database.get_results_by_job(task_id)
    return {"task_id": task_id, "results": results}

@router.get("/scrape/status/{task_id}", summary="Consultar estado de un trabajo")
async def get_scraping_status(task_id: str):
    job = database.get_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    results = database.get_results_by_job(task_id)
    success = sum(1 for r in results if r["status"] == "success")
    failed = sum(1 for r in results if r["status"] == "failed")
    completed = success + failed
    percent = (completed / job["total_urls"] * 100) if job["total_urls"] else 0

    error_detail = None
    if job["status"] == "FAILED":
        try:
            async_result = celery_app.AsyncResult(task_id)
            error_detail = str(async_result.info)
        except Exception as e:  # pragma: no cover - safety net for unreachable backend
            logging.exception("[Status] Error retrieving task result")
            error_detail = f"Unable to fetch error details: {e}"

    return {
        "task_id": task_id,
        "status": job["status"],
        "progress": {
            "total": job["total_urls"],
            "completed": completed,
            "success": success,
            "failed": failed,
            "percent": f"{percent:.2f}%",
        },
        "error": error_detail,
    }


@router.post("/scrape/pause/{task_id}", summary="Pausar un trabajo en ejecución")
async def pause_job(task_id: str):
    job = database.get_job(task_id)
    if not job or job["status"] != "RUNNING":
        raise HTTPException(status_code=400, detail="Job not running")
    if job["task_group_id"]:
        group_result = celery_app.GroupResult.restore(job["task_group_id"])
        if group_result:
            for child in group_result.children:
                celery_app.control.revoke(child.id, terminate=True)
    database.update_job_status(task_id, "PAUSED")
    scale_worker_containers()
    return {"status": "paused"}


@router.post("/scrape/resume/{task_id}", summary="Reanudar un trabajo pausado")
async def resume_job(task_id: str):
    job = database.get_job(task_id)
    if not job or job["status"] != "PAUSED":
        raise HTTPException(status_code=400, detail="Job not paused")
    pending = database.get_pending_urls(task_id)
    if not pending:
        database.update_job_status(task_id, "COMPLETED")
        scale_worker_containers()
        return {"status": "completed"}
    tasks_group = group(process_url_task.s(task_id, url) for url in pending)
    result_group = tasks_group.apply_async()
    database.update_job_group(task_id, result_group.id)
    database.update_job_status(task_id, "RUNNING")
    scale_worker_containers()
    return {"status": "resumed", "pending": len(pending)}


@router.post("/scrape/stop/{task_id}", summary="Cancelar un trabajo")
async def stop_job(task_id: str):
    job = database.get_job(task_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["task_group_id"]:
        group_result = celery_app.GroupResult.restore(job["task_group_id"])
        if group_result:
            for child in group_result.children:
                celery_app.control.revoke(child.id, terminate=True)
    database.update_job_status(task_id, "CANCELLED")
    scale_worker_containers()
    return {"status": "cancelled"}


@router.delete("/scrape/{task_id}", summary="Eliminar un trabajo y sus resultados")
async def delete_job(task_id: str):
    if not database.job_exists(task_id):
        raise HTTPException(status_code=404, detail="Job not found")
    database.delete_job(task_id)
    return {"status": "deleted"}


@router.get("/scrape/download/{task_id}", summary="Descargar resultados de un trabajo")
async def download_results(task_id: str):
    if not database.job_exists(task_id):
        raise HTTPException(status_code=404, detail="Job not found")
    results = database.get_results_by_job(task_id)
    return JSONResponse(content=results)


# Expose the same routes both at ``/`` and ``/api`` so that the frontend running
# behind a reverse proxy can reach them while tests and local development keep
# working against the root path.
app.include_router(router)
app.include_router(router, prefix="/api")
