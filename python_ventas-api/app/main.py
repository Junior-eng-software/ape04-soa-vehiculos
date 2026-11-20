"""Entrada de la API FastAPI; documentación OpenAPI y health."""
# Publica endpoints web y valida solicitudes.
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect
# Importa el componente local correspondiente a esta responsabilidad.
from app.errors import instalar
from app.routers.ventas import router
from app.config import OUTBOX_VENTAS_ACTIVA
from app.db import engine


@asynccontextmanager
async def lifespan(_app):
    if OUTBOX_VENTAS_ACTIVA and not inspect(engine).has_table("ventas_outbox"):
        raise RuntimeError("OUTBOX_VENTAS_ACTIVA requiere la migración Alembic 0003")
    yield


# Crea la aplicación web y genera /docs automáticamente.
app = FastAPI(title="API de ventas de vehículos", version="1.0.0", lifespan=lifespan)
# Registra respuestas uniformes para errores HTTP.
instalar(app)
# Publica las rutas REST del módulo de ventas.
app.include_router(router)


# Crea una comprobación liviana del proceso en /health.
@app.get("/health")
# Responde sin consultar Java o MySQL, por eso solo indica proceso activo.
def health():
    # Devuelve estado UP en JSON.
    return {"status": "UP"}
