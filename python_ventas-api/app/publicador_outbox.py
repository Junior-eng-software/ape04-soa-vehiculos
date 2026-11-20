"""Publicador independiente. Ejecutar explícitamente: python -m app.publicador_outbox."""
import logging
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError

from app.clients.amqp import PublicacionNoConfirmada, PublicadorAMQP
from app.config import OUTBOX_VENTAS_ACTIVA
from app.db import SessionLocal
from app.models import EventoOutbox, PENDIENTE_AMQP, PUBLICADA, Venta

log = logging.getLogger(__name__)


def utc_actual():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def publicar_uno(publicador):
    """Procesa como máximo un evento y conserva su fila si falla AMQP."""
    with SessionLocal.begin() as db:
        candidato = db.scalar(
            select(EventoOutbox.evento_id).where(
                EventoOutbox.publicado_utc.is_(None),
                EventoOutbox.proximo_intento_utc <= utc_actual(),
            ).order_by(EventoOutbox.proximo_intento_utc, EventoOutbox.evento_id).limit(1)
        )
        if candidato is None:
            return False

        # MariaDB 10.4 admite FOR UPDATE. El bloqueo por PK dura hasta guardar
        # el resultado, con un plazo acotado para la llamada AMQP.
        evento = db.scalar(select(EventoOutbox).where(
            EventoOutbox.evento_id == candidato
        ).with_for_update())
        if evento is None or evento.publicado_utc is not None or evento.proximo_intento_utc > utc_actual():
            return True

        evento.intentos += 1
        try:
            publicador.publicar(evento.mensaje())
        except PublicacionNoConfirmada:
            segundos = min(2 ** min(evento.intentos, 9), 300)
            evento.proximo_intento_utc = utc_actual() + timedelta(seconds=segundos)
            log.warning("Evento %s pendiente. Intento %s", evento.evento_id, evento.intentos)
            return True

        evento.publicado_utc = utc_actual()
        db.execute(update(Venta).where(
            Venta.id == evento.venta_id, Venta.notificacion == PENDIENTE_AMQP
        ).values(notificacion=PUBLICADA))
        return True


def main():
    if not OUTBOX_VENTAS_ACTIVA:
        raise SystemExit("El publicador requiere OUTBOX_VENTAS_ACTIVA=true")
    publicador = PublicadorAMQP()
    while True:
        try:
            if publicar_uno(publicador):
                continue
        except SQLAlchemyError as error:
            log.error("No se pudo guardar el avance del publicador: %s", type(error).__name__)
        time.sleep(2)


if __name__ == "__main__":
    main()
