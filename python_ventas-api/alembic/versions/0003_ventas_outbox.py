"""Agrega la bandeja de eventos sin reconstruir ventas anteriores."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ventas_outbox",
        sa.Column("evento_id", sa.String(36), primary_key=True),
        sa.Column("tipo", sa.String(32), nullable=False),
        sa.Column("venta_id", sa.Integer, sa.ForeignKey("ventas.id"), nullable=False),
        sa.Column("vehiculo_id", sa.Integer, nullable=False),
        sa.Column("fecha_utc", sa.DateTime, nullable=False),
        sa.Column("publicado_utc", sa.DateTime),
        sa.Column("proximo_intento_utc", sa.DateTime, nullable=False),
        sa.Column("intentos", sa.Integer, nullable=False),
        sa.UniqueConstraint("venta_id", "tipo", name="uq_ventas_outbox_venta_tipo"),
        mysql_engine="InnoDB",
    )
    op.create_index(
        "ix_ventas_outbox_pendientes", "ventas_outbox", ["publicado_utc", "proximo_intento_utc"]
    )


def downgrade():
    raise RuntimeError("Reversión con pérdida de eventos deshabilitada")
