import os
from typing import List, Optional

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    JSON,
    ForeignKey,
    inspect,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DB_PATH = os.getenv("SCRAPER_DB", "scraper.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True, index=True)
    total_urls = Column(Integer, default=0)
    status = Column(String, default="PENDING")
    urls = Column(JSON, nullable=True)
    task_group_id = Column(String, nullable=True)
    results = relationship("JobResult", back_populates="job", cascade="all, delete-orphan")


class JobResult(Base):
    __tablename__ = "job_results"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, ForeignKey("jobs.id"), index=True, nullable=False)
    url = Column(String, nullable=False)
    status = Column(String, nullable=False)
    data = Column(JSON, nullable=True)

    job = relationship("Job", back_populates="results")


def init_db() -> None:
    """Initialize database and ensure expected columns exist."""
    Base.metadata.create_all(bind=engine)

    # ``create_all`` does not add new columns to existing tables. When the
    # application is upgraded, older ``scraper.db`` files may miss recently
    # introduced fields (e.g. the ``urls`` column).  Here we inspect the
    # current schema and perform lightweight migrations if needed so the
    # application can run without manual intervention.
    with engine.begin() as conn:
        inspector = inspect(conn)
        columns = {col["name"] for col in inspector.get_columns("jobs")}

        if "urls" not in columns:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN urls JSON"))

        if "task_group_id" not in columns:
            conn.execute(text("ALTER TABLE jobs ADD COLUMN task_group_id STRING"))


def create_job(
    job_id: str,
    total: int = 0,
    urls: Optional[List[str]] = None,
    status: str = "RUNNING",
) -> None:
    """Create or update a job entry.

    Parameters
    ----------
    job_id:
        Identifier of the job.
    total:
        Total number of URLs that will be processed. Defaults to ``0`` so a
        job can be created before the discovery phase finishes.
    urls:
        Optional list of URLs discovered for this job.
    status:
        Initial status for the job. By default jobs start in ``RUNNING`` but a
        caller may pass ``"PENDING"`` to register the job before any work has
        begun.
    """
    with SessionLocal() as session:
        job = Job(id=job_id, total_urls=total, status=status, urls=urls)
        session.merge(job)
        session.commit()


def update_job_status(job_id: str, status: str) -> None:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job:
            job.status = status
            session.commit()


def update_job_group(job_id: str, group_id: str) -> None:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job:
            job.task_group_id = group_id
            session.commit()


def get_job(job_id: str) -> Optional[dict]:
    """Retrieve a job by ID and return it as a plain dictionary.

    Returning ORM instances after the session is closed can lead to
    ``DetachedInstanceError`` when their attributes are accessed later on.
    Converting the result to a simple ``dict`` avoids this problem and makes
    the data easier to serialise and reason about.
    """
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if not job:
            return None
        return {
            "id": job.id,
            "total_urls": job.total_urls,
            "status": job.status,
            "urls": job.urls,
            "task_group_id": job.task_group_id,
        }


def save_result(job_id: str, url: str, data: Optional[dict], status: str) -> None:
    with SessionLocal() as session:
        result = JobResult(job_id=job_id, url=url, data=data, status=status)
        session.add(result)
        session.commit()


def get_results_by_job(job_id: str) -> List[dict]:
    with SessionLocal() as session:
        results = session.query(JobResult).filter_by(job_id=job_id).all()
        return [
            {"url": r.url, "status": r.status, "data": r.data}
            for r in results
        ]


def count_jobs_by_status(status: str) -> int:
    with SessionLocal() as session:
        return session.query(Job).filter_by(status=status).count()


def job_exists(job_id: str) -> bool:
    return get_job(job_id) is not None


def delete_job(job_id: str) -> None:
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if job:
            session.delete(job)
            session.commit()


def get_pending_urls(job_id: str) -> List[str]:
    """Return URLs that have not yet been processed for a given job."""
    with SessionLocal() as session:
        job = session.get(Job, job_id)
        if not job or not job.urls:
            return []
        processed = {
            r.url for r in session.query(JobResult.url).filter_by(job_id=job_id)
        }
        return [url for url in job.urls if url not in processed]
