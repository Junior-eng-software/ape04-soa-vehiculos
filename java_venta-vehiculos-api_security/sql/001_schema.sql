-- Solo para una instalacion vacia autorizada. No ejecutar sobre tablas existentes.
-- No contiene usuarios ni registros. Hibernate mantiene ddl-auto=validate.
CREATE DATABASE IF NOT EXISTS venta_vehiculos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE venta_vehiculos;
CREATE TABLE vehiculos (
 id_vehiculo INT NOT NULL AUTO_INCREMENT,
 marca VARCHAR(50) NOT NULL, modelo VARCHAR(50) NOT NULL,
 placa VARCHAR(10) NOT NULL, chasis VARCHAR(17) NOT NULL,
 anio INT NOT NULL, color VARCHAR(30) NOT NULL,
 precio DECIMAL(12,2) NOT NULL, estado VARCHAR(255) NOT NULL,
 PRIMARY KEY (id_vehiculo), UNIQUE KEY placa (placa), UNIQUE KEY chasis (chasis)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE usuarios_api (
 id INT NOT NULL AUTO_INCREMENT, username VARCHAR(50) NOT NULL,
 password VARCHAR(255) NOT NULL, rol VARCHAR(20) NOT NULL,
 PRIMARY KEY (id), UNIQUE KEY username (username),
 CONSTRAINT chk_usuarios_api_rol CHECK (rol IN ('CONSULTA','OPERADOR','ADMIN'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE reservas (
 id VARCHAR(36) NOT NULL, operacion_id VARCHAR(64) NOT NULL,
 vehiculo_id INT NOT NULL, precio DECIMAL(12,2) NOT NULL,
 moneda VARCHAR(3) NOT NULL, estado VARCHAR(20) NOT NULL,
 PRIMARY KEY (id), UNIQUE KEY operacion_id (operacion_id),
 KEY fk_reserva_vehiculo (vehiculo_id),
 CONSTRAINT fk_reserva_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id_vehiculo),
 CONSTRAINT ck_reserva_estado CHECK (estado IN ('RESERVADA','CONFIRMADA','LIBERADA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Tabla existente vinculada a vehiculos: se conserva su estructura, sin ampliar el modelo Java.
CREATE TABLE historial_precios (
 id BIGINT NOT NULL AUTO_INCREMENT, vehiculo_id INT DEFAULT NULL,
 vehiculo_id_original INT NOT NULL, precio_anterior DECIMAL(12,2) NOT NULL,
 precio_nuevo DECIMAL(12,2) NOT NULL, fecha DATETIME(6) NOT NULL,
 usuario VARCHAR(255) NOT NULL, PRIMARY KEY (id),
 KEY idx_historial_precios_orden (vehiculo_id_original,fecha,id),
 KEY idx_historial_precios_vehiculo_fk (vehiculo_id),
 CONSTRAINT fk_historial_precios_vehiculo FOREIGN KEY (vehiculo_id)
 REFERENCES vehiculos (id_vehiculo) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
