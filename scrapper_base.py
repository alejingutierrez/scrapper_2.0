!pip install --upgrade openai==1.25.0 playwright requests beautifulsoup4 lxml \
               openpyxl tqdm nest_asyncio pillow
!playwright install chromium --with-deps

import os, asyncio, gzip, json, logging, re, random
from urllib.parse import urljoin, urlparse, urldefrag
from collections import deque

import nest_asyncio, requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, TimeoutError as PWTimeout
from openpyxl import Workbook
from tqdm.asyncio import tqdm_asyncio
from openai import AsyncOpenAI

# ─────────────────── CONFIGURACIÓN GENERAL ───────────────────
DOMINIOS         = ["https://www.drogueriascolsubsidio.com/","https://www.cruzverde.com.co/","https://www.locatelcolombia.com/","https://www.farmatodo.com.co/"]
HEADERS          = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Scraper/2.0"}
REQUEST_TIMEOUT  = 100
PAGE_TIMEOUT_MS  = 300000
MAX_PAGES_CRAWL  = 60000
MAX_FETCH_RETRY  = 5
CONCURRENCY      = 3
GPT_MODEL        = "gpt-4o-mini"

# La API key se carga desde la variable de entorno OPENAI_API_KEY
# No necesitamos configuración adicional de httpx para OpenAI

nest_asyncio.apply()
# El cliente de OpenAI se inicializa en scraper/extractor.py

# ─────────────────── CONTROL DE TOKENS ───────────────────
MAX_CONTENT_TOKENS = 118_000   # 128 000 (máx modelo) –≈ 10 000 margen otros campos

try:
    import tiktoken
    _ENC = tiktoken.encoding_for_model(GPT_MODEL)
except ImportError:
    _ENC = None
    logging.warning("tiktoken no disponible; el truncado será aproximado por longitud.")

def _truncate(text: str, max_tokens: int = MAX_CONTENT_TOKENS) -> str:
    """Recorta el string para que no exceda el nº máximo de tokens."""
    if _ENC:
        toks = _ENC.encode(text)
        if len(toks) > max_tokens:
            text = _ENC.decode(toks[:max_tokens])
    else:  # aproximación: 1 token ~ 4 chars
        text = text[: max_tokens * 4]
    return text

# ─────────────────── EXTRACCIÓN RESUMIDA DE CONTENIDO ───────────────────
def extract_text_and_urls(html: str) -> str:
    """
    Convierte el HTML a un string compacto y jerárquico:
      • Hn: encabezados
      • texto plano de <p> y <li>
      • IMG: url [ALT: …]
      • LINK: texto -> url
      • OG_IMAGE: url  (primera si existe)
    """
    soup = BeautifulSoup(html, "lxml")

    # eliminar ruido
    for tag in soup(["script", "style", "noscript", "template", "iframe"]):
        tag.decompose()

    pieces = []

    # Imagen principal por metadatos Open Graph / Twitter
    meta_img = (soup.find("meta", property="og:image")
                or soup.find("meta", attrs={"name": "twitter:image"}))
    if meta_img and meta_img.get("content"):
        pieces.append(f"OG_IMAGE: {meta_img['content']}")

    # Recorrido en orden de aparición
    walker = soup.body or soup
    for elem in walker.descendants:
        if not getattr(elem, "name", None):
            continue

        tag = elem.name.lower()
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            txt = elem.get_text(" ", strip=True)
            if txt:
                pieces.append(f"{tag.upper()}: {txt}")
        elif tag in ("p", "li"):
            txt = elem.get_text(" ", strip=True)
            if txt:
                pieces.append(txt)
        elif tag == "img":
            src = elem.get("src") or elem.get("data-src")
            if src and not _IMG_RX.search(src):
                # filtramos imágenes basura (favicon, sprites…)
                alt = elem.get("alt", "").strip()
                entry = f"IMG: {src}"
                if alt:
                    entry += f" [ALT: {alt}]"
                pieces.append(entry)
        elif tag == "a":
            href = elem.get("href")
            txt = elem.get_text(" ", strip=True)
            if href and txt:
                pieces.append(f"LINK: {txt} -> {href}")

    content = "\n".join(pieces)
    return _truncate(content)

# ─────────────────── FILTROS DE URL ───────────────────
_IMG_RX      = re.compile(r"\.(?:png|jpe?g|gif|webp|avif|bmp|svg)$", re.I)
_EXCLUDE_RX  = re.compile(r"(?:cdn\.shopify|\.jpg$|\.jpeg$|\.png$|\.gif$|\.svg$|\.webp$|\.avif$|\.bmp$)", re.I)

def _url_ok(u: str) -> bool:
    """True si la URL merece ser procesada (no imagen/CDN)."""
    return not _EXCLUDE_RX.search(u)

# ─────────────────── ESQUEMA JSON_SCHEMA ───────────────────
PRODUCT_SCHEMA = {
    "name": "drugstore_product_extraction_schema",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            # --- Identificación básica ---
            "title":  {"type": "string"},
            "brand":  {
                "type": "string",
                "description": "Marca comercial declarada en la ficha."
            },

            # --- Presentación & formulación ---
            "presentation": {
                "type": "string",
                "description": "Formato y cantidad. Ej.: 'Caja x 30 tabletas', 'Frasco 120 ml'."
            },
            "dosage_form": {
                "type": "string",
                "enum": [
                    "tabletas","cápsulas","jarabe","crema","gel","spray",
                    "solución","polvo","supositorios","parche"
                ]
            },
            "active_ingredients": {
                "type": "string",
                "description": "Principios activos separados por comas."
            },
            "concentration": {
                "type": "string",
                "description": "Concentración por unidad o volumen (p. ej. '500 mg', '10 mg/ml')."
            },

            # --- Precio ---
            "price": {
                "type": "number",
                "description": "Valor numérico del producto."
            },
            "currency": {
                "type": "string",
                "description": "COP, USD, EUR, etc. (Si no se indica y el precio está entre 1-999, asumir USD)."
            },

            # --- Descripción corta ---
            "short_description": {
                "type": "string",
                "description": "Máx. 30 palabras que resuman uso/beneficio."
            },

            # --- Clasificación de la tienda ---
            "category": {
                "type": "string",
                "enum": [
                    "proteccion solar","belleza facial","maquillaje","belleza corporal","belleza capilar",
                    "higiene personal","gripa","droguería general","alivio del dolor","salud digestiva",
                    "botiquin","salud visual","higiene femenina","cuidado bucal","dispositivos médicos",
                    "ortopedia y fisioterapia","terapia respiratoria","equipos de movilidad",
                    "formulas infantiles","nutrición infantil","higiene del bebé","pañales","accesorios del bebé",
                    "accesorios maternidad","vitaminas y suplementos","nutrición general","deportes",
                    "mascotas","libros","bienestar sexual","juguetes eróticos","test diagnóstico","primeros auxilios"
                ]
            },

            # --- Metadata de la página ---
            "image_url": {
                "type": "string",
                "description": "URL de la imagen principal."
            },
            "inventory": {
                "type": "string",
                "enum": ["en inventario","agotado","baja existencia"]
            },
            "prescription_required": {
                "type": "boolean",
                "description": "¿Requiere fórmula médica?"
            },
            "is_full_product_page": {
                "type": "boolean",
                "description": "True si la URL es la ficha completa del producto."
            }
        },

        "required": [
            "title", "brand", "presentation", "price", "currency", "short_description", "category",
            "ean", "sku", "characteristics", "tags", "size_variant", "image_url", "inventory",
            "prescription_required", "is_full_product_page"
        ],

        "additionalProperties": False
    }
}

# ─────────────────── UTILIDADES ───────────────────
_SITEMAP_PATHS = ["/sitemap.xml","/sitemap_index.xml",
                  "/sitemap.xml.gz","/wp-sitemap.xml"]

def _try_get(u, headers=None):
    try:
        return requests.get(u, timeout=REQUEST_TIMEOUT, headers=headers or HEADERS)
    except Exception:
        return None

def discover_sitemaps(base_url: str):
    parsed = urlparse(base_url if "://" in base_url else "https://"+base_url)
    base   = f"{parsed.scheme}://{parsed.netloc}"
    cands  = [urljoin(base, p) for p in _SITEMAP_PATHS]

    robots = _try_get(urljoin(base, "/robots.txt"))
    if robots and robots.ok:
        cands += [l.split(":",1)[1].strip() for l in robots.text.splitlines()
                  if l.lower().startswith("sitemap:")]

    home = _try_get(base)
    if home and home.ok:
        soup = BeautifulSoup(home.text, "lxml")
        cands += [urljoin(base, l["href"])
                  for l in soup.find_all("link",
                                         rel=lambda x: x and "sitemap" in x.lower())
                  if l.get("href")]

    sitemaps, seen = [], set()
    for u in cands:
        if u in seen: continue
        seen.add(u)
        res = _try_get(u, headers={"Accept":"application/xml"})
        if res and res.ok and res.content.startswith(b"<?xml"):
            sitemaps.append((res.url, res.content))
            logging.info("✔️ Sitemap válido: %s", res.url)
    return sitemaps

def urls_from_sitemaps(sitemaps):
    """Devuelve lista única de URLs filtradas."""
    urls = []
    for url, xml in sitemaps:
        try:
            if url.endswith(".gz"):
                xml = gzip.decompress(xml)
            soup = BeautifulSoup(xml, "xml")
        except Exception:
            continue

        if soup.find("sitemapindex"):
            for loc in soup.find_all("loc"):
                sub = _try_get(loc.text.strip())
                if sub and sub.ok:
                    urls += urls_from_sitemaps([(sub.url, sub.content)])
        else:
            urls += [loc.text.strip() for loc in soup.find_all("loc")]

    urls = [u for u in urls if _url_ok(u)]
    logging.info("🔎 URLs sitemap (filtradas): %d", len(urls))
    return list(dict.fromkeys(urls))

def crawl_site(base_url, limit=MAX_PAGES_CRAWL):
    logging.warning("🌐 Sin sitemap; crawling %s", base_url)
    dom = urlparse(base_url).netloc
    q, seen, out = deque([base_url]), set(), []

    while q and len(out) < limit:
        url = q.popleft()
        if url in seen or not _url_ok(url):
            continue

        seen.add(url)
        res = _try_get(url)
        if not (res and res.ok and "text/html" in res.headers.get("content-type","")):
            continue

        out.append(url)
        soup = BeautifulSoup(res.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = urldefrag(urljoin(url, a["href"]))[0]
            if (urlparse(href).netloc == dom and
                href not in seen and
                _url_ok(href)):
                q.append(href)

    logging.info("✅ Crawler encontró %d URLs (filtradas)", len(out))
    return out

# ───────────── GPT Structured Output ─────────────
def build_messages(url, html):
    content = extract_text_and_urls(html)
    return [
        {"role": "system",
         "content": "Eres experto en scraping; responde SOLO JSON con el esquema."},
        {"role": "user",
         "content": (
             f"Extrae datos del producto en {url}. "
             "Descripción máx. 20 palabras; tallas tipo 's,m,l'.\n\n"
             f"CONTENT:\n```\n{content}\n```"
         )}
    ]

async def gpt_extract(url, html):
    try:
        rsp = await client.chat.completions.create(
            model=GPT_MODEL,
            messages=build_messages(url, html),
            temperature=0.4,
            response_format={"type": "json_schema",
                             "json_schema": PRODUCT_SCHEMA}
        )
        data = json.loads(rsp.choices[0].message.content)
        data["url"] = url
        return [data]
    except Exception as e:
        logging.error("GPT error @ %s ➜ %s", url, e)
        return []

# ───────────── Playwright helpers ─────────────
async def fetch_html(page, url, retries=MAX_FETCH_RETRY):
    if _IMG_RX.search(url):
        return ""
    for i in range(retries):
        try:
            await page.goto(url, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=20_000)
            except PWTimeout:
                pass
            await page.wait_for_timeout(random.randint(800, 1500))
            return await page.content()
        except PWTimeout:
            logging.warning("⏱️ Timeout %s (intento %d)", url, i + 1)
        except Exception as e:
            logging.error("Playwright err %s ➜ %s", url, e)
        await page.wait_for_timeout(min(30_000, (2 ** i) * 1_000))
    return ""

async def process_url(ctx, url, sem):
    if not _url_ok(url):
        return []
    page = await ctx.new_page()
    html = await fetch_html(page, url)
    await page.close()
    if not html:
        return []
    async with sem:
        return await gpt_extract(url, html)

async def scrape_domain(domain):
    sm = discover_sitemaps(domain)
    urls = urls_from_sitemaps(sm) if sm else crawl_site(domain)
    if not urls:
        logging.error("❌ No se encontraron URLs procesables para %s", domain)
        return []

    sem = asyncio.Semaphore(CONCURRENCY)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--disable-dev-shm-usage", "--no-sandbox"]
        )
        ctx = await browser.new_context(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 900}
        )

        results = await tqdm_asyncio.gather(
            *[process_url(ctx, u, sem) for u in urls],
            desc=urlparse(domain).netloc
        )
        await browser.close()
    return [p for sub in results for p in sub]

# ───────────── Guardar Excel ─────────────
def save_excel(products, fname="productos_extraidos.xlsx"):
    if not products:
        logging.warning("⚠️ Sin productos para guardar.")
        return
    wb = Workbook(); ws = wb.active
    keys = sorted({k for p in products for k in p})
    ws.append(keys)
    for r, prod in enumerate(products, start=2):
        for c, k in enumerate(keys, start=1):
            val = prod.get(k, "")
            if isinstance(val, (list, dict, set)):
                val = json.dumps(val, ensure_ascii=False)
            ws.cell(r, c, val)
    wb.save(fname)
    logging.info("✅ Excel guardado: %s", fname)

# ───────────── MAIN ─────────────
async def main():
    productos = []
    for dom in DOMINIOS:
        productos += await scrape_domain(dom)

    logging.info("🛒 Productos extraídos: %d", len(productos))
    save_excel(productos)

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(message)s"
    )
    try:
        asyncio.run(main())
    finally:
        asyncio.run(http_client.aclose())
