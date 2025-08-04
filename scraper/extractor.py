import os
import logging
import json
import re
from bs4 import BeautifulSoup
from openai import AsyncOpenAI
import tiktoken

# --- Configuración --- 
GPT_MODEL = "gpt-4o-mini"
MAX_CONTENT_TOKENS = 118_000  # Margen de seguridad sobre el límite del modelo

# Inicializar cliente de OpenAI de forma segura
# Si la API key no está configurada no inicializamos el cliente para evitar
# que la aplicación falle durante el arranque.
client: AsyncOpenAI | None = None
api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    try:  # pragma: no cover - dependent on external service
        client = AsyncOpenAI(api_key=api_key)
    except Exception as exc:  # pragma: no cover - best effort
        logging.warning("No se pudo inicializar el cliente de OpenAI: %s", exc)
else:
    logging.warning("OPENAI_API_KEY no configurada; la extracción se deshabilitará")

# Inicializar codificador de tokens
try:
    _ENC = tiktoken.encoding_for_model(GPT_MODEL)
except ImportError:
    _ENC = None
    logging.warning("tiktoken no disponible; el truncado de texto será aproximado.")

# --- Esquema de extracción (movido desde el script original) ---
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
            },

            # --- Campos adicionales ---
            "ean": {
                "type": "string",
                "description": "Código de barras EAN si está disponible."
            },
            "sku": {
                "type": "string",
                "description": "Código SKU del producto si está disponible."
            },
            "characteristics": {
                "type": "string",
                "description": "Características adicionales del producto."
            },
            "tags": {
                "type": "string",
                "description": "Etiquetas o palabras clave separadas por comas."
            },
            "size_variant": {
                "type": "string",
                "description": "Variante de tamaño si aplica."
            }
        },

        "required": [
            "title", "brand", "presentation", "dosage_form", "active_ingredients", "concentration",
            "price", "currency", "short_description", "category", "ean", "sku", "characteristics", 
            "tags", "size_variant", "image_url", "inventory", "prescription_required", "is_full_product_page"
        ],

        "additionalProperties": False
    }
}

def _truncate_text(text: str, max_tokens: int = MAX_CONTENT_TOKENS) -> str:
    """Recorta el texto para no exceder el límite de tokens del modelo."""
    if not text:
        return ""
    if _ENC:
        tokens = _ENC.encode(text)
        if len(tokens) > max_tokens:
            return _ENC.decode(tokens[:max_tokens])
    else: # Fallback si tiktoken no está
        return text[:max_tokens * 4]
    return text

def _clean_html_for_llm(html: str) -> str:
    """Convierte HTML a un texto limpio y estructurado para el LLM."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()

    # Extraer texto de etiquetas importantes
    text_parts = []
    for tag in soup.find_all(['h1', 'h2', 'h3', 'p', 'li', 'span', 'div']):
        text = tag.get_text(" ", strip=True)
        if text:
            text_parts.append(text)
    
    return "\n".join(text_parts)

async def extract_product_data_from_html(url: str, html: str) -> dict | None:
    """
    Orquesta la extracción de datos de un HTML: limpia, prepara el prompt y llama a GPT.
    """
    cleaned_text = _clean_html_for_llm(html)
    truncated_text = _truncate_text(cleaned_text)

    if not truncated_text:
        logging.warning(f"[Extractor] No se pudo extraer contenido procesable de {url}")
        return None

    messages = [
        {
            "role": "system",
            "content": "Eres un experto en web scraping. Extraes datos de productos y respondes únicamente con un objeto JSON que se adhiere estrictamente al esquema proporcionado.",
        },
        {
            "role": "user",
            "content": f"Extrae la información del producto de la siguiente URL: {url}\n\nContenido de la página:\n---\n{truncated_text}",
        },
    ]

    if not client:
        logging.error("[Extractor] Cliente de OpenAI no configurado; omitiendo extracción")
        return None

    try:  # pragma: no cover - network call
        response = await client.chat.completions.create(
            model=GPT_MODEL,
            messages=messages,
            temperature=0.2,  # Temperatura baja para mayor consistencia
            response_format={"type": "json_schema", "json_schema": PRODUCT_SCHEMA},
        )
        extracted_data = json.loads(response.choices[0].message.content)
        extracted_data['url'] = url  # Añadir la URL original para trazabilidad
        logging.info(f"[Extractor] Datos extraídos exitosamente de {url}")
        return extracted_data
    except Exception as e:  # pragma: no cover - best effort
        logging.error(f"[Extractor] Error en la llamada a GPT para {url}: {e}")
        return None
