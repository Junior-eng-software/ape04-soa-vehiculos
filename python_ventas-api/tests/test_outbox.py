import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, select
from sqlalchemy.exc import OperationalError

from test_integracion_simulada import sistema


@pytest.fixture
def flujo_outbox(sistema, monkeypatch):
    from app import main
    from app.repositories import venta_repository
    from app.services import venta_service

    for modulo in (main, venta_repository, venta_service):
        monkeypatch.setattr(modulo, "OUTBOX_VENTAS_ACTIVA", True)
    cliente, estado = sistema
    headers = {"Authorization": "Bearer valido", "Idempotency-Key": "prueba-outbox-01"}
    comprador = cliente.post("/api/compradores", headers=headers, json={
        "documento": "PRUEBA-1", "nombre": "Comprador de prueba", "correo": "p@example.test",
    })
    assert comprador.status_code == 201
    return cliente, estado, headers, {"vehiculoId": 1, "compradorId": comprador.json()["id"]}


def test_confirmacion_replay_y_rechazo(flujo_outbox):
    from app.db import SessionLocal
    from app.models import EventoOutbox

    cliente, estado, headers, datos = flujo_outbox
    primera = cliente.post("/api/ventas", headers=headers, json=datos)
    assert primera.status_code == 201
    assert primera.json()["estado"] == "COMPLETADA"
    assert primera.json()["notificacion"] == "PENDIENTE_AMQP"
    repetida = cliente.post("/api/ventas", headers=headers, json=datos)
    assert repetida.status_code == 200 and repetida.json()["id"] == primera.json()["id"]
    rechazada = cliente.post("/api/ventas", headers={**headers, "Idempotency-Key": "prueba-outbox-02"}, json=datos)
    assert rechazada.status_code == 409
    assert estado["avisos"] == []
    with SessionLocal() as db:
        mensaje = db.scalars(select(EventoOutbox)).one().mensaje()
    assert set(mensaje) == {"eventoId", "tipo", "ventaId", "vehiculoId", "fechaUTC"}
    assert UUID(mensaje["eventoId"]).version == 4
    assert mensaje["tipo"] == "VENTA_CONFIRMADA"
    assert mensaje["ventaId"] == primera.json()["id"] and mensaje["vehiculoId"] == datos["vehiculoId"]
    assert datetime.fromisoformat(mensaje["fechaUTC"]).tzinfo == timezone.utc


def test_outbox_fallida_revierte_la_confirmacion_local(flujo_outbox):
    from app.db import SessionLocal, engine
    from app.models import EventoOutbox, Venta

    def impedir_insert(_conexion, _cursor, sql, _parametros, _contexto, _lote):
        if sql.startswith("INSERT INTO ventas_outbox"):
            raise OperationalError(None, None, RuntimeError("fallo simulado"))

    cliente, estado, headers, datos = flujo_outbox
    event.listen(engine, "before_cursor_execute", impedir_insert)
    try:
        assert cliente.post("/api/ventas", headers=headers, json=datos).status_code == 503
    finally:
        event.remove(engine, "before_cursor_execute", impedir_insert)
    assert estado["vehiculos"][1] == "VENDIDO"
    with SessionLocal() as db:
        assert db.scalars(select(Venta)).one().estado == "PENDIENTE"
        assert db.scalar(select(EventoOutbox)) is None
    assert cliente.post("/api/ventas", headers=headers, json=datos).status_code == 200
    with SessionLocal() as db:
        assert db.scalars(select(Venta)).one().estado == "COMPLETADA"
        assert db.scalars(select(EventoOutbox)).one().venta_id == 1


def test_reserva_no_correspondiente_no_genera_evento(flujo_outbox, monkeypatch):
    from app.db import SessionLocal
    from app.models import EventoOutbox
    from app.services import venta_service

    cliente, _, headers, datos = flujo_outbox
    original = venta_service.remote.confirmar
    monkeypatch.setattr(venta_service.remote, "confirmar", lambda reserva: {
        **original(reserva), "vehiculoId": 999,
    })
    revision = cliente.post("/api/ventas", headers=headers, json=datos)
    assert revision.status_code == 202 and revision.json()["estado"] == "EN_REVISION"
    with SessionLocal() as db:
        assert db.scalar(select(EventoOutbox)) is None
    assert cliente.post("/api/ventas", headers=headers, json=datos).status_code == 200
    with SessionLocal() as db:
        assert db.scalars(select(EventoOutbox)).one().vehiculo_id == datos["vehiculoId"]


def test_inicio_sin_migracion_solo_es_posible_con_outbox_desactivada(sistema, monkeypatch):
    from app import main

    cliente, _ = sistema
    monkeypatch.setattr(main, "inspect", lambda _engine: SimpleNamespace(has_table=lambda _tabla: False))
    with cliente:
        assert cliente.get("/health").status_code == 200
    monkeypatch.setattr(main, "OUTBOX_VENTAS_ACTIVA", True)
    with pytest.raises(RuntimeError, match="0003"), cliente:
        pytest.fail("FastAPI inició con Outbox activa y sin migración")


def test_conserva_aviso_historico_al_repetir_venta(sistema, monkeypatch):
    from app.db import SessionLocal
    from app.models import EventoOutbox
    from app.repositories import venta_repository
    from app.services import venta_service

    cliente, estado = sistema
    estado["notificaciones_activas"] = False
    headers = {"Authorization": "Bearer valido", "Idempotency-Key": "prueba-historica"}
    comprador = cliente.post("/api/compradores", headers=headers, json={
        "documento": "PRUEBA-1", "nombre": "Comprador de prueba", "correo": "p@example.test",
    })
    datos = {"vehiculoId": 1, "compradorId": comprador.json()["id"]}
    anterior = cliente.post("/api/ventas", headers=headers, json=datos)
    assert anterior.json()["notificacion"] == "PENDIENTE"

    estado["notificaciones_activas"] = True
    monkeypatch.setattr(venta_service, "OUTBOX_VENTAS_ACTIVA", True)
    monkeypatch.setattr(venta_repository, "OUTBOX_VENTAS_ACTIVA", True)
    repetida = cliente.post("/api/ventas", headers=headers, json=datos)
    assert repetida.status_code == 200 and repetida.json()["notificacion"] == "PENDIENTE"
    assert estado["avisos"] == []
    with SessionLocal() as db:
        assert db.scalar(select(EventoOutbox)) is None
        assert venta_repository.VentaRepository(db).pendientes() == []


@pytest.mark.parametrize("fallo", ["caido", "confirmacion_perdida", "no_enrutable"])
def test_publicador_reintenta_con_el_mismo_evento(flujo_outbox, monkeypatch, fallo):
    import aio_pika
    from aio_pika.exceptions import PublishError
    from pamqp.commands import Basic

    from app.clients.amqp import PublicadorAMQP
    from app.db import SessionLocal
    from app.models import EventoOutbox, Venta
    from app import publicador_outbox

    cliente, _, headers, datos = flujo_outbox
    primera = cliente.post("/api/ventas", headers=headers, json=datos)
    assert primera.status_code == 201
    for variable, valor in {
        "AMQP_HOST": "localhost", "AMQP_PORT": "5672", "AMQP_VHOST": "ape04",
        "AMQP_USER": "prueba", "AMQP_PASSWORD": str(uuid4()),
    }.items():
        monkeypatch.setenv(variable, valor)

    devuelto = Basic.Return(reply_code=312, reply_text="NO_ROUTE", routing_key="venta.confirmada")
    publicar = AsyncMock(side_effect={
        "no_enrutable": PublishError(SimpleNamespace(delivery=devuelto), devuelto),
        "confirmacion_perdida": TimeoutError(),
    }.get(fallo), return_value=Basic.Ack())
    canal = SimpleNamespace(get_exchange=AsyncMock(return_value=SimpleNamespace(publish=publicar)))
    conexion = MagicMock(channel=AsyncMock(return_value=canal))
    conectar = AsyncMock(side_effect=OSError() if fallo == "caido" else None, return_value=conexion)
    monkeypatch.setattr(aio_pika, "connect", conectar)
    publicador = PublicadorAMQP()

    assert publicador_outbox.publicar_uno(publicador)
    assert not publicador_outbox.publicar_uno(publicador)
    with SessionLocal.begin() as db:
        evento = db.scalars(select(EventoOutbox)).one()
        esperado = evento.mensaje()
        assert evento.intentos == 1 and evento.publicado_utc is None
        assert evento.proximo_intento_utc > publicador_outbox.utc_actual()
        assert db.get(Venta, evento.venta_id).notificacion == "PENDIENTE_AMQP"
        evento.proximo_intento_utc = evento.fecha_utc

    conectar.side_effect = publicar.side_effect = None
    assert publicador_outbox.publicar_uno(publicador)
    assert not publicador_outbox.publicar_uno(publicador)
    assert conectar.call_args.kwargs["virtualhost"] == "ape04"
    assert all(llamada.kwargs == {"publisher_confirms": True, "on_return_raises": True}
               for llamada in conexion.channel.call_args_list)
    canal.get_exchange.assert_awaited_with("ventas", ensure=False)
    assert publicar.await_count == (1 if fallo == "caido" else 2)
    for llamada in publicar.call_args_list:
        assert llamada.kwargs["routing_key"] == "venta.confirmada" and llamada.kwargs["mandatory"] is True
        mensaje = llamada.args[0]
        assert mensaje.delivery_mode == aio_pika.DeliveryMode.PERSISTENT
        assert mensaje.message_id == esperado["eventoId"]
        assert json.loads(mensaje.body) == esperado
    with SessionLocal() as db:
        evento = db.get(EventoOutbox, esperado["eventoId"])
        assert evento.intentos == 2 and evento.publicado_utc is not None
        assert db.get(Venta, evento.venta_id).notificacion == "PUBLICADA"
