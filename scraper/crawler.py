import asyncio
import logging
import gzip
import re
from urllib.parse import urljoin, urlparse
from collections import deque

import httpx
from bs4 import BeautifulSoup
from .browser import get_random_user_agent

# --- Configuración ---
MAX_PAGES_CRAWL = 500  # Límite para el rastreo manual
REQUEST_TIMEOUT = 15
SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap.xml.gz", "/wp-sitemap.xml"]

# Expresiones regulares para filtrar URLs (simplificado)
_EXCLUDE_EXT = re.compile(r"\.(?:png|jpe?g|gif|webp|avif|bmp|svg|css|js|pdf|zip|gz)$", re.I)
_PRODUCT_RX = re.compile(r"/(?:p|product|producto|item|dp)/", re.I)


async def _fetch_url(client: httpx.AsyncClient, url: str, max_retries: int = 3) -> str | bytes | None:
    """Descarga ``url`` con reintentos y rotación de User-Agent."""

    for attempt in range(max_retries):
        headers = {"User-Agent": get_random_user_agent()}
        try:
            response = await client.get(url, headers=headers, follow_redirects=True)
            response.raise_for_status()
            if url.endswith(".gz"):
                return gzip.decompress(response.content)
            return response.text
        except httpx.HTTPStatusError as e:
            logging.warning(
                f"[Crawler] Error HTTP {e.response.status_code} al buscar {url} (intento {attempt + 1})"
            )
            if e.response.status_code in {403, 429, 500, 503} and attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                continue
        except Exception as e:
            logging.error(
                f"[Crawler] Error al buscar {url}: {e} (intento {attempt + 1})"
            )
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
                continue
        break
    return None


async def _discover_sitemaps_from_robots(client: httpx.AsyncClient, base_url: str) -> list[str]:
    """Lee ``robots.txt`` y extrae entradas ``Sitemap`` si existen."""

    robots_url = urljoin(base_url, "robots.txt")
    content = await _fetch_url(client, robots_url)
    if not content:
        return []
    sitemap_urls = []
    for line in content.splitlines():
        if line.lower().startswith("sitemap:"):
            sitemap_urls.append(line.split(":", 1)[1].strip())
    return sitemap_urls


def _parse_sitemap(sitemap_content: str) -> list[str]:
    """Parsea el contenido de un sitemap (XML) y extrae las URLs."""

    urls = []
    soup = BeautifulSoup(sitemap_content, "xml")
    for loc in soup.find_all("loc"):
        urls.append(loc.text.strip())
    return urls


async def find_urls_via_sitemap(domain: str) -> list[str] | None:
    """Intenta encontrar y parsear sitemaps para un dominio."""

    base_url = urljoin(domain, "/")
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        candidates = [urljoin(base_url, p) for p in SITEMAP_PATHS]
        candidates.extend(await _discover_sitemaps_from_robots(client, base_url))

        all_urls: list[str] = []
        for sitemap_url in candidates:
            logging.info(f"[Crawler] Buscando sitemap en: {sitemap_url}")
            content = await _fetch_url(client, sitemap_url)
            if not content:
                continue
            sitemap_urls = _parse_sitemap(content)

            # Si es un sitemap de sitemaps, explorarlos recursivamente
            nested = [u for u in sitemap_urls if "sitemap" in u]
            if nested:
                nested_contents = await asyncio.gather(
                    *[_fetch_url(client, u) for u in nested]
                )
                for sitemap_content in nested_contents:
                    if sitemap_content:
                        sitemap_urls.extend(_parse_sitemap(sitemap_content))

            all_urls.extend(sitemap_urls)

        if not all_urls:
            return None

        # Eliminar duplicados conservando orden
        seen = set()
        unique_urls = []
        for u in all_urls:
            if u not in seen:
                seen.add(u)
                unique_urls.append(u)

        product_urls = [u for u in unique_urls if _PRODUCT_RX.search(u)]
        return product_urls or unique_urls


async def find_urls_via_crawl(domain: str) -> list[str]:
    """Realiza un rastreo básico del sitio para encontrar URLs."""

    logging.info(
        f"[Crawler] No se encontraron sitemaps, iniciando rastreo manual de {domain}"
    )
    urls_found = set()
    queue = deque([urljoin(domain, "/")])
    base_netloc = urlparse(domain).netloc

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        while queue and len(urls_found) < MAX_PAGES_CRAWL:
            url = queue.popleft()
            if url in urls_found:
                continue

            content = await _fetch_url(client, url)
            if not content:
                continue

            urls_found.add(url)
            logging.info(
                f"[Crawler] Rastreado: {url} ({len(urls_found)}/{MAX_PAGES_CRAWL})"
            )

            soup = BeautifulSoup(content, "lxml")
            for link in soup.find_all("a", href=True):
                href = link["href"]
                abs_url = urljoin(url, href)
                # Limpiar fragmentos y parámetros de consulta
                abs_url = abs_url.split("#")[0].split("?")[0]

                if (
                    urlparse(abs_url).netloc == base_netloc
                    and not _EXCLUDE_EXT.search(abs_url)
                ):
                    if abs_url not in urls_found and abs_url not in queue:
                        queue.append(abs_url)

    return list(urls_found)


async def get_urls_for_domain(domain: str) -> list[str]:
    """Función principal que orquesta la búsqueda de URLs para un dominio."""

    logging.info(f"Iniciando descubrimiento de URLs para {domain}")
    urls = await find_urls_via_sitemap(domain)
    if not urls:
        urls = await find_urls_via_crawl(domain)

    product_urls = [u for u in urls if _PRODUCT_RX.search(u)]

    if product_urls:
        logging.info(
            f"[Crawler] Se encontraron {len(product_urls)} URLs de producto potenciales para {domain}"
        )
        return product_urls
    else:
        logging.warning(
            f"[Crawler] No se encontraron URLs de producto específicas, se usarán todas las {len(urls)} URLs encontradas."
        )
        return urls
