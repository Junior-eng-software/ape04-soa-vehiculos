-- MariaDB 10.4. Ejecutar con el cliente mariadb/mysql y las escrituras suspendidas.
-- Falla antes de cambiar el esquema si algún usuario tiene un rol propio asignado.
-- Se eliminan todos los roles, incluso los roles propios sin usuarios. Volver a
-- la versión anterior de Java antes de reanudar el servicio.
USE venta_vehiculos;

DELIMITER //
BEGIN NOT ATOMIC
    IF EXISTS (
        SELECT 1 FROM usuarios_api
        WHERE rol NOT IN ('CONSULTA', 'OPERADOR', 'ADMIN')
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Rollback cancelado: hay usuarios con roles propios asignados';
    END IF;

    ALTER TABLE usuarios_api
        DROP FOREIGN KEY fk_usuarios_api_rol,
        DROP INDEX IF EXISTS fk_usuarios_api_rol,
        MODIFY COLUMN rol VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        ADD CONSTRAINT chk_usuarios_api_rol CHECK (rol IN ('CONSULTA', 'OPERADOR', 'ADMIN'));

    DROP TABLE roles;
END//
DELIMITER ;
