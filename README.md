# Scraper 2.0 - Aplicación de Scraping Robusta

Esta aplicación permite extraer información de productos desde múltiples sitios web de forma paralela, robusta y escalable. Cuenta con un backend basado en FastAPI, un sistema de tareas con Celery y una interfaz de usuario sencilla para gestionar los procesos.

## Estructura del Proyecto

```
/
├── backend/               # Lógica del servidor API (FastAPI)
│   ├── __init__.py
│   └── main.py            # Endpoints de la API
├── scraper/               # Módulos de scraping
│   ├── __init__.py
│   ├── browser.py         # Lógica de control del navegador (Playwright)
│   ├── extractor.py       # Extracción de datos con GPT
│   ├── crawler.py         # Lógica para descubrir URLs (Sitemaps, Crawling)
│   └── storage.py         # Guardado de datos (Excel, BBDD)
├── frontend/              # Interfaz de usuario
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scrapper_base.py       # Script original (referencia)
├── requirements.txt       # Dependencias del proyecto
└── README.md              # Este archivo
```

## Puesta en Marcha

1.  **Instalar dependencias:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Instalar Playwright:**
    ```bash
    playwright install chromium --with-deps
    ```

3.  **Configurar variables de entorno:**
    Crea un archivo `.env` en la raíz del proyecto con tu API Key de OpenAI:
    ```
    OPENAI_API_KEY="tu_api_key_aqui"
    ```

4.  **Iniciar servicios (Redis, Celery, FastAPI):**
    *   **Redis:** (Requiere Docker o instalación local)
        ```bash
        docker run -d -p 6379:6379 redis
        ```
    *   **Celery Worker:**
        ```bash
        # Ajusta "-c" para lanzar múltiples procesos y acelerar el scraping
        celery -A backend.main.celery_app worker -c 4 --loglevel=info
        ```
    *   **FastAPI Server:**
        ```bash
        uvicorn backend.main:app --reload
        ```

5.  **Abrir el frontend:**
    Abre el archivo `frontend/index.html` en tu navegador.

Los datos extraídos se guardan tanto en `results.jsonl` como en la base de datos SQLite `scraper.db` (o la ruta especificada en la variable de entorno `SCRAPER_DB`).
La base de datos almacena cada trabajo de scraping y sus resultados asociados, lo que permite consultar los datos por `task_id` mediante el endpoint `/scrape/results/{task_id}`.

## Seguimiento de progreso

Al iniciar un trabajo, el backend calcula primero cuántas URLs se van a procesar y expone esa información a través del endpoint `/scrape/status/{task_id}`. El frontend muestra desde el principio el total de URLs y va actualizando el número de exitos y fallos conforme avanzan los workers.

## Escalado dinámico de workers

Cuando se ejecuta con Docker Compose, el backend ajusta automáticamente la cantidad de contenedores `worker` para mantener cinco procesos por cada trabajo activo. Al finalizar o cancelar un trabajo, los contenedores sobrantes se detienen, liberando recursos sin intervención manual.

## Despliegue en Vercel

El proyecto incluye configuración para desplegar el frontend de React y funciones serverless en [Vercel](https://vercel.com).

1. **Variables de entorno**
   - `OPENAI_API_KEY`: clave de OpenAI.
   - `SCRAPER_DB`: ruta a la base de datos (opcional).
   - `BLOB_READ_WRITE_TOKEN`: token de lectura/escritura para Vercel Blob.
   - `EDGE_CONFIG`: cadena de conexión de Edge Config.

   Puedes copiar `.env.example` a `.env` y completar los valores. Luego sincroniza con Vercel:
   ```bash
   vercel env pull
   ```

2. **Instalar dependencias de las funciones**
   ```bash
   npm --prefix api install
   ```

3. **Desplegar**
   ```bash
   vercel deploy
   ```

Las funciones disponibles son:

- `api/upload.js`: permite subir contenidos a [Vercel Blob](https://vercel.com/docs/storage/vercel-blob).
- `api/welcome.js`: lee valores de [Edge Config](https://vercel.com/docs/storage/edge-config).

