"""Garantiza la unicidad global del correo sin reescribir compradores."""
from alembic import context, op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    if context.is_offline_mode():
        raise RuntimeError("La revisión 0004 requiere conexión para verificar correos duplicados")

    conexion = op.get_bind()
    grupos = conexion.scalar(sa.text("""
        SELECT COUNT(*) FROM (
            SELECT CONVERT(LOWER(TRIM(correo)) USING utf8mb4) COLLATE utf8mb4_bin
            FROM compradores
            GROUP BY 1
            HAVING COUNT(*) > 1
        ) AS duplicados
    """))
    if grupos:
        raise RuntimeError(
            f"No se aplicó 0004: {grupos} grupo(s) con correo duplicado. "
            "Resuelva los duplicados antes de reintentar."
        )

    # Una sola DDL evita dejar la columna sin su índice si se rechaza la unicidad.
    try:
        op.execute("""
            ALTER TABLE compradores
                ADD COLUMN correo_normalizado VARCHAR(200)
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
                    GENERATED ALWAYS AS (LOWER(TRIM(correo))) STORED,
                ADD CONSTRAINT uq_comprador_correo_normalizado UNIQUE (correo_normalizado)
        """)
    except sa.exc.DBAPIError as error:
        if error.orig.args and error.orig.args[0] == 1062:
            raise RuntimeError("No se aplicó 0004: aparecieron correos duplicados durante la migración") from None
        raise


def downgrade():
    op.execute("""
        ALTER TABLE compradores
            DROP INDEX uq_comprador_correo_normalizado,
            DROP COLUMN correo_normalizado
    """)
