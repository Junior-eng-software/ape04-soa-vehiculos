CREATE SCHEMA IF NOT EXISTS notificaciones_api;

CREATE TABLE IF NOT EXISTS notificaciones_api.notificaciones_ventas (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    evento_id CHAR(36) NOT NULL,
    tipo VARCHAR(32) NOT NULL,
    venta_id INT NOT NULL,
    vehiculo_id INT NOT NULL,
    fecha_utc DATETIME(6) NOT NULL,
    CONSTRAINT uq_notificaciones_evento UNIQUE (evento_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notificaciones_api.notificaciones_cuarentena (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    motivo VARCHAR(32) NOT NULL,
    recibida_utc DATETIME(6) NOT NULL
) ENGINE=InnoDB;
