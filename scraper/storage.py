"""Helpers for persisting scraped data."""
from typing import Any
from backend import database

# Ensure database is initialised when this module is imported
try:
    database.init_db()
except Exception:  # pragma: no cover - best effort
    pass

def save_product(data: dict) -> None:
    """Persist a single product dictionary into the SQLite database."""
    database.save_product(data)

