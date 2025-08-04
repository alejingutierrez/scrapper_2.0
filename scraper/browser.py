import asyncio
import logging
import os
import random
from typing import List

import httpx
from playwright.async_api import (
    BrowserContext,
    Page,
    TimeoutError as PWTimeout,
)

# --- Configuración --- (Eventualmente mover a un archivo de config central)
PAGE_TIMEOUT_MS = int(os.getenv("PAGE_TIMEOUT_MS", "30000"))  # 30 segundos por defecto
MAX_FETCH_RETRY = 3
# Retraso configurable tras la carga de la página para simular al usuario.
DELAY_RANGE = (
    float(os.getenv("SCRAPER_DELAY_MIN", "0")),
    float(os.getenv("SCRAPER_DELAY_MAX", "1")),
)

# Rotación básica de user agents para evitar bloqueos simples.
USER_AGENTS: List[str] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
]

# Cabecera por defecto utilizada como base (se actualiza dinámicamente en cada petición)
HEADERS = {"User-Agent": USER_AGENTS[0]}


def get_random_user_agent() -> str:
    """Devuelve un user agent aleatorio."""

    return random.choice(USER_AGENTS)


async def create_context(browser, *, proxy: str | None = None) -> BrowserContext:
    """Crea un contexto de navegador con rotación de user agent y soporte de proxy."""

    context = await browser.new_context(
        user_agent=get_random_user_agent(),
        proxy={"server": proxy} if proxy else None,
    )
    # Ocultar `navigator.webdriver` para reducir bloqueos básicos.
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return context


async def get_html_from_url(context: BrowserContext, url: str) -> str | None:
    """Obtiene el HTML de ``url`` usando Playwright y hace fallback a HTTP puro si falla."""

    page: Page | None = None
    for attempt in range(MAX_FETCH_RETRY):
        try:
            page = await context.new_page()
            await page.route(
                "**/*",
                lambda route: route.abort()
                if route.request.resource_type in ["image", "stylesheet", "font", "media"]
                else route.continue_(),
            )

            await page.goto(url, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle", timeout=15000)

            # Retardo aleatorio para simular navegación humana
            await asyncio.sleep(random.uniform(*DELAY_RANGE))

            await _handle_cookie_banners(page)
            return await page.content()

        except PWTimeout:
            logging.warning(
                f"[Browser] Timeout en intento {attempt + 1}/{MAX_FETCH_RETRY} para {url}"
            )
        except Exception as exc:
            logging.error(
                f"[Browser] Error inesperado en intento {attempt + 1}/{MAX_FETCH_RETRY} para {url}: {exc}"
            )
        finally:
            if page:
                await page.close()

        await asyncio.sleep((2 ** attempt) * 2)

    logging.error(
        f"[Browser] No se pudo obtener el HTML de {url} después de {MAX_FETCH_RETRY} intentos."
    )

    # Fallback usando httpx, útil cuando Playwright es bloqueado.
    try:
        async with httpx.AsyncClient(
            timeout=PAGE_TIMEOUT_MS / 1000,
            headers={"User-Agent": get_random_user_agent()},
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text
    except Exception as exc:
        logging.error(f"[Browser] Fallback HTTP request failed for {url}: {exc}")
        return None


async def _handle_cookie_banners(page: Page):
    """Intenta detectar y cerrar banners de cookies de forma genérica."""

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
            button = page.locator(selector).first
            if await button.is_visible(timeout=500):
                await button.click(timeout=1000)
                logging.info(
                    f"[Browser] Banner de cookies cerrado con el selector: {selector}"
                )
                await asyncio.sleep(0.5)
                return
        except Exception:
            # Es normal que muchos selectores fallen
            pass
