"""Publicación de ventas en la topología aprovisionada por T23."""
import asyncio
import json

import aio_pika
from pamqp.commands import Basic

from app.config import requerido


class PublicacionNoConfirmada(Exception):
    """El publicador debe conservar el evento para otro intento."""


class PublicadorAMQP:
    def __init__(self):
        self.conexion = {
            "host": requerido("AMQP_HOST"),
            "port": int(requerido("AMQP_PORT")),
            "virtualhost": requerido("AMQP_VHOST"),
            "login": requerido("AMQP_USER"),
            "password": requerido("AMQP_PASSWORD"),
        }

    def publicar(self, evento):
        try:
            asyncio.run(self._publicar_con_plazo(evento))
        except (aio_pika.exceptions.AMQPException,
                aio_pika.exceptions.ChannelInvalidStateError, OSError) as error:
            raise PublicacionNoConfirmada from error

    async def _publicar_con_plazo(self, evento):
        await asyncio.wait_for(self._publicar(evento), timeout=8)

    async def _publicar(self, evento):
        conexion = await aio_pika.connect(**self.conexion, timeout=3)
        async with conexion:
            canal = await conexion.channel(publisher_confirms=True, on_return_raises=True)
            exchange = await canal.get_exchange("ventas", ensure=False)
            confirmacion = await exchange.publish(
                aio_pika.Message(
                    json.dumps(evento, separators=(",", ":")).encode("utf-8"),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    message_id=evento["eventoId"],
                ),
                routing_key="venta.confirmada",
                mandatory=True,
                timeout=3,
            )
            if not isinstance(confirmacion, Basic.Ack):
                raise PublicacionNoConfirmada
