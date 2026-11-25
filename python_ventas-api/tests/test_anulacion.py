"""Ejercita los estados de anulación y el bloqueo real con MariaDB opcional."""
from concurrent.futures import ThreadPoolExecutor
from os import environ
from pathlib import Path
from threading import Event
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import URL, create_engine, delete, select, text

from test_integracion_simulada import construir_sistema, sistema

ADMIN = {"Authorization": "Bearer admin"}
OPERADOR = {"Authorization": "Bearer valido"}


def comprador(cliente):
    sufijo = uuid4().hex[:16]
    respuesta = cliente.post("/api/compradores", headers=ADMIN, json={
        "documento": "DOC-" + sufijo, "nombre": "Comprador de prueba",
        "correo": f"{sufijo}@example.test",
    })
    assert respuesta.status_code == 201
    return respuesta.json()["id"]


def crear_venta(cliente, id_comprador, clave, vehiculo=1):
    return cliente.post("/api/ventas", headers={**ADMIN, "Idempotency-Key": clave},
                        json={"vehiculoId": vehiculo, "compradorId": id_comprador})


def detalle(cliente, id_venta):
    respuesta = cliente.get(f"/api/ventas/{id_venta}", headers=ADMIN)
    assert respuesta.status_code == 200
    return respuesta.json()


def persistida(id_venta):
    from app.db import SessionLocal
    from app.models import Venta
    with SessionLocal() as db:
        return db.get(Venta, id_venta)


def test_anula_con_auditoria_y_revende_con_dos_reservas(sistema, monkeypatch):
    from app.db import SessionLocal
    from app.models import EventoOutbox
    from app.services import venta_service

    cliente, java = sistema
    monkeypatch.setattr(venta_service, "OUTBOX_VENTAS_ACTIVA", True)
    id_comprador = comprador(cliente)
    clave = uuid4().hex
    primera = crear_venta(cliente, id_comprador, clave)
    assert primera.status_code == 201
    anterior = primera.json()
    ruta = f"/api/ventas/{anterior['id']}"
    assert cliente.delete(ruta, headers=ADMIN).status_code == 204
    assert cliente.delete(ruta, headers=ADMIN).status_code == 204
    assert java["anulaciones"] == [anterior["operacionId"]]
    assert java["reservas"][anterior["operacionId"]]["estado"] == "ANULADA"
    assert java["vehiculos"][1] == "DISPONIBLE"
    anulada = persistida(anterior["id"])
    assert anulada.estado == "ANULADA"
    assert anulada.anulada_por == "admin" and anulada.anulada_utc is not None
    assert anulada.idempotency_key == clave
    assert detalle(cliente, anulada.id)["estado"] == "ANULADA"
    assert cliente.get("/api/ventas", headers=ADMIN).json() == []
    historial = cliente.get("/api/ventas?incluirAnuladas=true", headers=ADMIN).json()
    assert [(v["id"], v["estado"]) for v in historial] == [(anulada.id, "ANULADA")]
    assert cliente.get("/api/ventas?incluirAnuladas=true", headers=OPERADOR).status_code == 403

    replay = crear_venta(cliente, id_comprador, clave)
    assert replay.status_code == 409 and replay.json()["codigo"] == "VENTA_ANULADA"
    nueva = crear_venta(cliente, id_comprador, uuid4().hex)
    assert nueva.status_code == 201
    segunda = nueva.json()
    assert segunda["id"] != anulada.id and segunda["operacionId"] != anterior["operacionId"]
    assert java["vehiculos"][1] == "VENDIDO"
    assert java["reservas"][segunda["operacionId"]]["estado"] == "CONFIRMADA"
    with SessionLocal() as db:
        eventos = db.execute(select(EventoOutbox.venta_id, EventoOutbox.tipo).order_by(EventoOutbox.venta_id)).all()
    assert eventos == [(anulada.id, "VENTA_CONFIRMADA"), (segunda["id"], "VENTA_CONFIRMADA")]


@pytest.mark.parametrize(("status", "codigo"), [(409, "CONFLICTO_RESERVA"), (404, "RESERVA_NO_ENCONTRADA")])
def test_rechazo_explicito_restaura_completada(sistema, monkeypatch, status, codigo):
    cliente, java = sistema
    venta = crear_venta(cliente, comprador(cliente), uuid4().hex).json()
    original = httpx.request

    def rechazo(metodo, url, **kwargs):
        if url.endswith("/anulacion"):
            assert persistida(venta["id"]).estado == "ANULANDO"
            return httpx.Response(status, json={"codigo": codigo})
        return original(metodo, url, **kwargs)

    monkeypatch.setattr(httpx, "request", rechazo)
    respuesta = cliente.delete(f"/api/ventas/{venta['id']}", headers=ADMIN)
    assert respuesta.status_code == status and respuesta.json()["codigo"] == codigo
    restaurada = persistida(venta["id"])
    assert restaurada.estado == "COMPLETADA" and restaurada.anulada_utc is None
    assert restaurada.anulada_por is None and java["vehiculos"][1] == "VENDIDO"


@pytest.mark.parametrize("fallo", ["timeout", "red", "5xx", "4xx sin código"])
def test_incertidumbre_conserva_anulando_y_reintenta_la_reserva_original(sistema, monkeypatch, fallo):
    cliente, java = sistema
    id_comprador = comprador(cliente)
    clave = uuid4().hex
    venta = crear_venta(cliente, id_comprador, clave).json()
    ruta = f"/api/ventas/{venta['id']}"
    original = httpx.request

    def sin_confirmacion(metodo, url, **kwargs):
        if not url.endswith("/anulacion"):
            return original(metodo, url, **kwargs)
        assert persistida(venta["id"]).estado == "ANULANDO"
        # Java aplica la anulación, pero su respuesta se pierde o se altera.
        assert original(metodo, url, **kwargs).status_code == 200
        if fallo == "timeout":
            raise httpx.ReadTimeout("simulado")
        if fallo == "red":
            raise httpx.ConnectError("simulado")
        return httpx.Response(502 if fallo == "5xx" else 409, json={"error": "sin confirmación"})

    monkeypatch.setattr(httpx, "request", sin_confirmacion)
    pendiente = cliente.delete(ruta, headers=ADMIN)
    assert pendiente.status_code == 202 and pendiente.headers["Location"] == ruta
    assert detalle(cliente, venta["id"])["estado"] == "ANULANDO"
    assert persistida(venta["id"]).anulada_utc is None
    assert cliente.get("/api/ventas", headers=ADMIN).json()[0]["estado"] == "ANULANDO"
    replay = crear_venta(cliente, id_comprador, clave)
    assert replay.status_code == 409 and replay.json()["codigo"] == "ANULACION_PENDIENTE"

    monkeypatch.setattr(httpx, "request", original)
    assert cliente.delete(ruta, headers=ADMIN).status_code == 204
    assert java["anulaciones"] == [venta["operacionId"]] * 2
    assert detalle(cliente, venta["id"])["estado"] == "ANULADA"


@pytest.mark.parametrize(("estado", "status"), [("FALLIDA", 204), ("EN_REVISION", 409), ("PENDIENTE", 409)])
def test_estados_sin_anulacion_remota(sistema, estado, status):
    from app.db import SessionLocal
    from app.models import Venta

    cliente, java = sistema
    venta = crear_venta(cliente, comprador(cliente), uuid4().hex).json()
    with SessionLocal.begin() as db:
        db.get(Venta, venta["id"]).estado = estado
    respuesta = cliente.delete(f"/api/ventas/{venta['id']}", headers=ADMIN)
    assert respuesta.status_code == status
    assert detalle(cliente, venta["id"])["estado"] == ("ANULADA" if status == 204 else estado)
    guardada = persistida(venta["id"])
    assert (guardada.anulada_por, guardada.anulada_utc is not None) == (
        ("admin", True) if status == 204 else (None, False)
    )
    assert java["anulaciones"] == []


def test_operador_no_puede_anular(sistema):
    cliente, java = sistema
    venta = crear_venta(cliente, comprador(cliente), uuid4().hex).json()
    assert cliente.delete(f"/api/ventas/{venta['id']}", headers=OPERADOR).status_code == 403
    assert detalle(cliente, venta["id"])["estado"] == "COMPLETADA"
    assert java["anulaciones"] == []


@pytest.fixture
def sistema_mariadb(monkeypatch):
    directorio = environ.get("VENTAS_TEST_DB_DATADIR")
    if not directorio:
        pytest.skip("Requiere MariaDB desechable con Alembic 0005")
    puerto = int(environ["VENTAS_TEST_DB_PORT"])
    assert 49152 <= puerto <= 65535
    engine = create_engine(URL.create("mysql+pymysql", host="127.0.0.1", port=puerto,
                                       username=environ["VENTAS_TEST_DB_USER"],
                                       password=environ.get("VENTAS_TEST_DB_PASSWORD", ""), database="ventas_api"),
                           isolation_level="READ COMMITTED")
    try:
        with engine.connect() as db:
            assert Path(directorio).samefile(db.scalar(text("SELECT @@datadir")))
            assert db.scalar(text("SELECT version_num FROM alembic_version")) == "0005"
        yield construir_sistema(monkeypatch, engine)
    finally:
        engine.dispose()


def test_doble_delete_concurrente_bloquea_la_fila_en_mariadb(sistema_mariadb, monkeypatch):
    from app.db import SessionLocal
    from app.models import Comprador, Venta

    cliente, java = sistema_mariadb
    id_comprador = comprador(cliente)
    primera_llamada, liberar, segundo_listo = Event(), Event(), Event()
    original = httpx.request
    try:
        venta = crear_venta(cliente, id_comprador, uuid4().hex).json()
        ruta = f"/api/ventas/{venta['id']}"

        def retener(metodo, url, **kwargs):
            if url.endswith("/anulacion"):
                primera_llamada.set()
                assert liberar.wait(10)
            return original(metodo, url, **kwargs)

        def segundo_delete():
            segundo_listo.set()
            return cliente.delete(ruta, headers=ADMIN)

        monkeypatch.setattr(httpx, "request", retener)
        with ThreadPoolExecutor(max_workers=2) as pool:
            primero = pool.submit(cliente.delete, ruta, headers=ADMIN)
            try:
                assert primera_llamada.wait(10)
                assert persistida(venta["id"]).estado == "ANULANDO"
                segundo = pool.submit(segundo_delete)
                assert segundo_listo.wait(10)
                # El segundo no puede terminar mientras el primero tiene la fila.
                with pytest.raises(TimeoutError):
                    segundo.result(timeout=0.25)
            finally:
                liberar.set()
            assert primero.result(timeout=10).status_code == segundo.result(timeout=10).status_code == 204
        assert java["anulaciones"] == [venta["operacionId"]]
        assert persistida(venta["id"]).estado == "ANULADA"
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(Venta).where(Venta.comprador_id == id_comprador))
            db.execute(delete(Comprador).where(Comprador.id == id_comprador))
