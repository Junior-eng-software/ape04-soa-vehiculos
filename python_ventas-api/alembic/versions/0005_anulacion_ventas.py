"""Conserva los datos de auditoría de la anulación de ventas."""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # estado es VARCHAR(20) sin CHECK en el esquema Alembic original.
    op.execute("""
        ALTER TABLE ventas
            ADD COLUMN anulada_utc DATETIME NULL,
            ADD COLUMN anulada_por VARCHAR(100) NULL
    """)


def downgrade():
    raise RuntimeError("Reversión deshabilitada para conservar la auditoría de anulaciones")
