"""Consultas SQLAlchemy para listados, seguimiento e idempotencia de ventas."""
# Ofrece ORM, consultas y transacciones SQL.
from sqlalchemy import select, or_
# Importa el componente local correspondiente a esta responsabilidad.
from app.models import Venta
from app.security import filtrar_visibles
from app.config import OUTBOX_VENTAS_ACTIVA


# Aísla las consultas SQLAlchemy del resto de la aplicación.
class VentaRepository:

    # Recibe la sesión de base de datos creada por otra capa.
    def __init__(self, db):
        # Almacena la sesión para realizar las consultas.
        self.db = db

    def listar_visibles(self, usuario):
        consulta = select(
            Venta.id, Venta.vehiculo_id, Venta.comprador_id, Venta.estado,
            Venta.precio_acordado, Venta.moneda, Venta.fecha,
        ).order_by(Venta.id)
        return self.db.execute(filtrar_visibles(consulta, Venta.usuario, usuario)).all()

    # Busca una venta previa perteneciente al usuario y clave indicados.
    def por_clave(self, usuario, clave):
        # Lee una sola venta que cumple la condición.
        return self.db.scalar(select(Venta).where(
            # Filtra por propietario y clave idempotente al mismo tiempo.
            Venta.usuario == usuario, Venta.idempotency_key == clave))

    # Bloquea la fila para evitar que dos operaciones la procesen simultáneamente.
    def bloquear(self, id):
        # Lee una sola venta que cumple la condición.
        return self.db.scalar(select(Venta).where(Venta.id == id)
                              # Solicita bloqueo de fila en MySQL hasta terminar la transacción.
                              .with_for_update())

    # Consulta ventas sin completar y avisos aún no enviados.
    def pendientes(self):
        pendientes = Venta.estado.in_(["PENDIENTE", "EN_REVISION"])
        if not OUTBOX_VENTAS_ACTIVA:
            pendientes = or_(pendientes, (Venta.estado == "COMPLETADA") & (Venta.notificacion == "PENDIENTE"))
        return self.db.scalars(select(Venta.id).where(pendientes).order_by(Venta.id).limit(100)).all()
