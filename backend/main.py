import os
import logging
import asyncio
import json
from dotenv import load_dotenv

# Cargar variables de entorno ANTES de cualquier otra importación del proyecto
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from celery import Celery, group
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
    allow_credentials=True,
    allow_methods=["*"],  # Permite todos los métodos (GET, POST, etc.)
    allow_headers=["*"],  # Permite todas las cabeceras
)

class ScrapeRequest(BaseModel):
    domains: list[str]

# --- Tareas de Celery ---

@celery_app.task(name="process_url_task", bind=True, acks_late=True, max_retries=2)
def process_url_task(self, url: str):
    """Tarea síncrona que envuelve la lógica asíncrona de scraping."""
    return asyncio.run(scrape_single_url(self, url))

async def scrape_single_url(task_self, url: str):
    """Lógica asíncrona real para procesar una única URL."""
    logging.info(f"[URL Task] Iniciando procesamiento de: {url}")
    try:
        async with async_playwright() as pw:
            pw_browser = await pw.chromium.launch(headless=True)
            context = await pw_browser.new_context(user_agent=browser.HEADERS['User-Agent'])
            
            html = await browser.get_html_from_url(context, url)
            if not html:
                return {"url": url, "status": "failed", "reason": "No se pudo obtener HTML"}
            
            product_data = await extractor.extract_product_data_from_html(url, html)
            if not product_data:
                return {"url": url, "status": "failed", "reason": "No se pudieron extraer datos"}

            # Guardar en archivo y base de datos
            with open("results.jsonl", "a", encoding="utf-8") as f:
                f.write(json.dumps(product_data, ensure_ascii=False) + "\n")
            storage.save_product(product_data)
            
            await pw_browser.close()
            return {"url": url, "status": "success", "data": product_data['title']}
    except Exception as e:
        logging.error(f"[URL Task] Falla catastrófica en {url}: {e}")
        task_self.update_state(state='FAILURE', meta=str(e))
        raise

@celery_app.task(name="start_scraping_task", bind=True)
def start_scraping_task(self, domains: list[str]):
    """Tarea principal síncrona que orquesta el scraping de dominios."""
    # Usar el bucle de eventos existente en lugar de asyncio.run() para evitar conflictos
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(orchestrate_scraping(self, domains))

async def orchestrate_scraping(task_self, domains: list[str]):
    """Lógica de orquestación asíncrona para el scraping."""
    logging.info(f"[Main Task] Descubriendo URLs para: {domains}")
    
    url_lists = await asyncio.gather(*[crawler.get_urls_for_domain(domain) for domain in domains])
    all_urls = [url for sublist in url_lists for url in sublist]
    
    if not all_urls:
        logging.warning("[Main Task] No se encontraron URLs para procesar.")
        task_self.update_state(state='SUCCESS', meta={'status': 'No URLs found'})
        return {'status': 'No URLs found', 'total': 0}

    total_urls = len(all_urls)
    task_self.update_state(state='PROGRESS', meta={'total': len(all_urls), 'status': 'Descubriendo URLs...'})
    logging.info(f"Se descubrieron {len(all_urls)} URLs para los dominios: {domains}")

    if all_urls:
        tasks_group = group(process_url_task.s(url) for url in all_urls)
        result_group = tasks_group.apply_async()
        
        task_self.update_state(state='PROGRESS', meta={'task_group_id': result_group.id, 'total': len(all_urls), 'status': 'Procesando URLs...'})
        logging.info(f"Grupo de tareas {result_group.id} lanzado.")

        completed_results = result_group.get() 
        
        final_results = [item for sublist in completed_results if sublist for item in sublist]
        
        return {'status': 'Completed', 'total_urls_processed': len(all_urls), 'products_found': len(final_results)}
    else:
        logging.warning("No se encontraron URLs para procesar.")
        return {'status': 'Completed', 'total_urls_processed': 0, 'products_found': 0}

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

@app.get("/scrape/status/{task_id}", summary="Consultar estado de un trabajo")
async def get_scraping_status(task_id: str):
    """
    Endpoint mejorado para consultar el estado de un trabajo de scraping.
    Proporciona un desglose detallado del progreso, incluyendo éxitos y fallos.
    """
    main_task = celery_app.AsyncResult(task_id)
    
    if not main_task:
        raise HTTPException(status_code=404, detail="Task not found")

    response = {
        "task_id": task_id,
        "status": main_task.status,
        "info": main_task.info
    }

    if main_task.state == 'FAILURE':
        return response

    task_info = main_task.info if isinstance(main_task.info, dict) else {}
    if not task_info and isinstance(main_task.result, dict):
        task_info = main_task.result

    group_id = task_info.get('task_group_id')
    total_urls = task_info.get('total', 0)

    if group_id:
        # GroupResult tiene métodos más eficientes para contar
        group_result = celery_app.GroupResult.restore(group_id)
        if group_result:
            success_count = group_result.successful_count()
            failure_count = group_result.failed_count()
            completed_count = success_count + failure_count
            
            progress_percent = (completed_count / total_urls * 100) if total_urls > 0 else 0

            response['progress'] = {
                "total": total_urls,
                "completed": completed_count,
                "success": success_count,
                "failed": failure_count,
                "percent": f"{progress_percent:.2f}%"
            }
    
    elif main_task.state == 'SUCCESS' and 'status' in task_info:
        response['progress'] = task_info

    return response
