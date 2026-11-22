-- Instalación nueva: ejecutar después de 001_schema.sql.
-- Instalación existente: aplicar solo esta revisión cuando se autorice el cambio.
ALTER TABLE venta_vehiculos.vehiculos
    MODIFY COLUMN color VARCHAR(30) NULL DEFAULT NULL;
