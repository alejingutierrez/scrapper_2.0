import os
from sqlalchemy import create_engine, Column, Integer, String, JSON
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = os.getenv("SCRAPER_DB", "scraper.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, nullable=False)
    data = Column(JSON, nullable=False)

def init_db() -> None:
    Base.metadata.create_all(bind=engine)

def save_product(data: dict) -> None:
    with SessionLocal() as session:
        product = Product(url=data.get("url", ""), data=data)
        session.merge(product)
        session.commit()
