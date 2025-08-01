import asyncio
import logging
import random
from playwright.async_api import async_playwright, TimeoutError as PWTimeout, Page, BrowserContext

# --- Configuración --- (Eventualmente mover a un archivo de config central)
PAGE_TIMEOUT_MS = 30000  # 30 segundos
MAX_FETCH_RETRY = 3
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36 Scraper/2.0"}

async def get_html_from_url(context: BrowserContext, url: str) -> str | None:
    """
    Navega a una URL usando una página del contexto y devuelve su contenido HTML.
    Incluye reintentos y manejo de errores.
    """
    page = None
    for attempt in range(MAX_FETCH_RETRY):
        try:
            page = await context.new_page()
            # Bloquear recursos innecesarios para acelerar la carga
            await page.route(
                "**/*",
                lambda route: route.abort() if route.request.resource_type in ["image", "stylesheet", "font", "media"] else route.continue_()
            )

            await page.goto(url, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
            
            # Espera a que la red esté inactiva para asegurarse de que el contenido dinámico se cargue
            await page.wait_for_load_state("networkidle", timeout=15000)

            # A veces, un pequeño retardo adicional ayuda a capturar scripts de última hora
            await asyncio.sleep(random.uniform(1, 2.5))

            # Intentar cerrar banners de cookies de forma genérica
            await _handle_cookie_banners(page)

            content = await page.content()
            return content

        except PWTimeout:
            logging.warning(f"[Browser] Timeout en intento {attempt + 1}/{MAX_FETCH_RETRY} para {url}")
        except Exception as e:
            logging.error(f"[Browser] Error inesperado en intento {attempt + 1}/{MAX_FETCH_RETRY} para {url}: {e}")
        finally:
            if page:
                await page.close()
        
        # Espera exponencial antes de reintentar
        await asyncio.sleep((2 ** attempt) * 2)

    logging.error(f"[Browser] No se pudo obtener el HTML de {url} después de {MAX_FETCH_RETRY} intentos.")
    return None

async def _handle_cookie_banners(page: Page):
    """
    Intenta detectar y hacer clic en botones de aceptar cookies de forma genérica.
    """
    cookie_selectors = [
        '[id*="cookie"] a',
        '[class*="cookie"] a',
        '[id*="banner"] button',
        '[class*="banner"] button',
        'button:has-text("Accept")',
        'button:has-text("Aceptar")',
        'button:has-text("OK")',
    ]
    for selector in cookie_selectors:
        try:
            # Usamos `locator` con un timeout corto para no ralentizar el proceso
            button = page.locator(selector).first
            if await button.is_visible(timeout=500):
                await button.click(timeout=1000)
                logging.info(f"[Browser] Banner de cookies cerrado con el selector: {selector}")
                await asyncio.sleep(500) # Esperar a que el banner desaparezca
                return # Salir en cuanto se encuentra y se hace clic en uno
        except Exception:
            # Es normal que muchos selectores fallen, así que no registramos error
            pass
