import os
import importlib


def test_scale_worker_containers(monkeypatch, tmp_path):
    os.environ["SCRAPER_DB"] = str(tmp_path / "test.db")
    os.environ.setdefault("OPENAI_API_KEY", "test")
    from backend import database
    importlib.reload(database)
    database.init_db()
    import backend.main as main
    importlib.reload(main)

    database.create_job("job1", total=1, urls=["u"], status="RUNNING")
    database.create_job("job2", total=1, urls=["u"], status="PENDING")

    calls = []

    def fake_run(cmd, check):
        calls.append(cmd)

    monkeypatch.setattr(main.subprocess, "run", fake_run)
    main.scale_worker_containers()
    assert calls[-1][4] == "worker=2"

    database.update_job_status("job1", "COMPLETED")
    database.update_job_status("job2", "COMPLETED")
    main.scale_worker_containers()
    assert calls[-1][4] == "worker=0"
