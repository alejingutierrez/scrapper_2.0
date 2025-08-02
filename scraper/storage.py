"""Helpers for persisting scraped data."""
from typing import Optional
from backend import database

# Ensure database is initialised when this module is imported
try:
    database.init_db()
except Exception:  # pragma: no cover - best effort
    pass


def save_product(job_id: str, url: str, data: Optional[dict], status: str) -> None:
    """Persist a single result dictionary into the SQLite database."""
    database.save_result(job_id, url, data, status)
