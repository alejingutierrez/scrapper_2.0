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
        celery -A backend.main.celery_app worker --loglevel=info
        ```
    *   **FastAPI Server:**
        ```bash
        uvicorn backend.main:app --reload
        ```

5.  **Abrir el frontend:**
    Abre el archivo `frontend/index.html` en tu navegador.
