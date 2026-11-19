"""Reproduce columnas de reintento ya presentes en el esquema legado.

Compatibilidad estructural observada en MariaDB; no introduce comportamiento
nuevo ni modifica los modelos o reglas de ventas. La revision 0001 se conserva.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ventas", sa.Column("intentos_venta", sa.Integer(),
                                     nullable=False, server_default=sa.text("0")))
    op.add_column("ventas", sa.Column("proximo_intento_venta_utc", mysql.DATETIME(fsp=6),
                                     nullable=True))
    op.add_column("ventas", sa.Column("intentos_notificacion", sa.Integer(),
                                     nullable=False, server_default=sa.text("0")))
    op.add_column("ventas", sa.Column("proximo_intento_notificacion_utc", mysql.DATETIME(fsp=6),
                                     nullable=True))


def downgrade():
    raise RuntimeError("Reversion con perdida de columnas deshabilitada")
