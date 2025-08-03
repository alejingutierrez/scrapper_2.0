import os
import importlib
from fastapi.testclient import TestClient


def create_app(tmp_path):
    os.environ["SCRAPER_DB"] = str(tmp_path / "test.db")
    os.environ.setdefault("OPENAI_API_KEY", "test")
    from backend import database
    importlib.reload(database)
    database.init_db()
    import backend.main as main
    importlib.reload(main)
    return main.app


def test_root_health_check(tmp_path):
    app = create_app(tmp_path)
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
