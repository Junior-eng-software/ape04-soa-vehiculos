-- Exportado con alembic upgrade 0004:0005 --sql.
-- Aplicar solo si ventas_api.alembic_version tiene version_num = '0004'.
-- Es una alternativa a ejecutar alembic upgrade 0005.
USE ventas_api;

-- Running upgrade 0004 -> 0005

ALTER TABLE ventas
    ADD COLUMN anulada_utc DATETIME NULL,
    ADD COLUMN anulada_por VARCHAR(100) NULL;

UPDATE alembic_version SET version_num='0005' WHERE alembic_version.version_num = '0004';
