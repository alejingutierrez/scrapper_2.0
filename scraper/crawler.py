import asyncio
import logging
import gzip
import re
from urllib.parse import urljoin, urlparse
from collections import deque
import httpx
from bs4 import BeautifulSoup

# --- Configuración ---
MAX_PAGES_CRAWL = 500  # Límite para el rastreo manual
REQUEST_TIMEOUT = 15
SITEMAP_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap.xml.gz", "/wp-sitemap.xml"]
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"}

# Expresiones regulares para filtrar URLs (simplificado)
_EXCLUDE_EXT = re.compile(r"\.(?:png|jpe?g|gif|webp|avif|bmp|svg|css|js|pdf|zip|gz)$", re.I)

async def _fetch_url(client: httpx.AsyncClient, url: str):
    try:
        response = await client.get(url, headers=HEADERS, follow_redirects=True)
        response.raise_for_status()
        if url.endswith('.gz'):
            return gzip.decompress(response.content)
        return response.text
    except httpx.HTTPStatusError as e:
        logging.warning(f"[Crawler] Error HTTP {e.response.status_code} al buscar {url}")
    except Exception as e:
        logging.error(f"[Crawler] Error al buscar {url}: {e}")
    return None

def _parse_sitemap(sitemap_content: str) -> list[str]:
    """Parsea el contenido de un sitemap (XML) y extrae las URLs."""
    urls = []
    soup = BeautifulSoup(sitemap_content, 'xml')
    for loc in soup.find_all('loc'):
        urls.append(loc.text.strip())
    return urls

async def find_urls_via_sitemap(domain: str) -> list[str] | None:
    """Intenta encontrar y parsear sitemaps para un dominio."""
    base_url = urljoin(domain, '/')
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        for path in SITEMAP_PATHS:
            sitemap_url = urljoin(base_url, path)
            logging.info(f"[Crawler] Buscando sitemap en: {sitemap_url}")
            content = await _fetch_url(client, sitemap_url)
            if content:
                logging.info(f"[Crawler] Sitemap encontrado en {sitemap_url}")
                sitemap_urls = _parse_sitemap(content)
                # Si es un sitemap de sitemaps, explorarlos
                if any("sitemap" in u for u in sitemap_urls):
                    nested_urls = await asyncio.gather(*[_fetch_url(client, u) for u in sitemap_urls])
                    all_urls = []
                    for sitemap_content in nested_urls:
                        if sitemap_content:
                            all_urls.extend(_parse_sitemap(sitemap_content))
                    return all_urls
                return sitemap_urls
    return None

async def find_urls_via_crawl(domain: str) -> list[str]:
    """Realiza un rastreo básico del sitio para encontrar URLs."""
    logging.info(f"[Crawler] No se encontraron sitemaps, iniciando rastreo manual de {domain}")
    urls_found = set()
    queue = deque([urljoin(domain, '/')])
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
            logging.info(f"[Crawler] Rastreado: {url} ({len(urls_found)}/{MAX_PAGES_CRAWL})")

            soup = BeautifulSoup(content, 'lxml')
            for link in soup.find_all('a', href=True):
                href = link['href']
                abs_url = urljoin(url, href)
                # Limpiar fragmentos y parámetros de consulta (opcional, pero ayuda)
                abs_url = abs_url.split('#')[0].split('?')[0]

                if urlparse(abs_url).netloc == base_netloc and not _EXCLUDE_EXT.search(abs_url):
                    if abs_url not in urls_found and abs_url not in queue:
                        queue.append(abs_url)
    
    return list(urls_found)

async def get_urls_for_domain(domain: str) -> list[str]:
    """Función principal que orquesta la búsqueda de URLs para un dominio."""
    logging.info(f"Iniciando descubrimiento de URLs para {domain}")
    urls = await find_urls_via_sitemap(domain)
    if not urls:
        urls = await find_urls_via_crawl(domain)
    
    # Filtro final para asegurar que solo procesamos URLs de productos (heurística)
    product_keywords = ['/p/', '/producto/', '/product/', '/dp/', '/item/']
    product_urls = [u for u in urls if any(kw in u for kw in product_keywords)]

    if product_urls:
        logging.info(f"[Crawler] Se encontraron {len(product_urls)} URLs de producto potenciales para {domain}")
        return product_urls
    else:
        logging.warning(f"[Crawler] No se encontraron URLs de producto específicas, se usarán todas las {len(urls)} URLs encontradas.")
        return urls
