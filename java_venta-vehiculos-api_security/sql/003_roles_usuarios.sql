-- MariaDB 10.4. Ejecutar con el cliente mariadb/mysql y las escrituras suspendidas.
-- Comprobar SHOW CREATE TABLE venta_vehiculos.usuarios_api: InnoDB, utf8mb4,
-- utf8mb4_unicode_ci y CHECK chk_usuarios_api_rol como en 001_schema.sql.
USE venta_vehiculos;

-- Una segunda ejecución falla en CREATE TABLE antes de tocar filas o la FK.
-- El bloque detiene las sentencias restantes ante un error. El DDL confirma
-- cambios de forma implícita, incluso dentro del bloque.
DELIMITER //
BEGIN NOT ATOMIC
    CREATE TABLE roles (
        nombre VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        descripcion VARCHAR(255) NOT NULL DEFAULT '',
        rol_base VARCHAR(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (nombre),
        CONSTRAINT chk_roles_nombre CHECK (
            CHAR_LENGTH(nombre) BETWEEN 3 AND 30 AND BINARY nombre NOT REGEXP '[^A-Z0-9_]'
        ),
        CONSTRAINT chk_roles_base CHECK (BINARY rol_base IN ('CONSULTA', 'OPERADOR', 'ADMIN')),
        CONSTRAINT chk_roles_sistema CHECK (es_sistema IN (0, 1))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    INSERT INTO roles (nombre, descripcion, rol_base, es_sistema) VALUES
        ('CONSULTA', 'Consulta de vehículos', 'CONSULTA', 1),
        ('OPERADOR', 'Operaciones de vehículos y ventas', 'OPERADOR', 1),
        ('ADMIN', 'Administración del sistema', 'ADMIN', 1);

    -- Canonicalizar las variantes que admitía la intercalación del CHECK anterior.
    UPDATE usuarios_api
    SET rol = CASE rol
        WHEN 'CONSULTA' THEN 'CONSULTA'
        WHEN 'OPERADOR' THEN 'OPERADOR'
        WHEN 'ADMIN' THEN 'ADMIN'
        ELSE rol
    END
    WHERE BINARY rol NOT IN ('CONSULTA', 'OPERADOR', 'ADMIN');

    ALTER TABLE usuarios_api
        DROP CONSTRAINT chk_usuarios_api_rol,
        MODIFY COLUMN rol VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        ADD CONSTRAINT fk_usuarios_api_rol FOREIGN KEY (rol) REFERENCES roles (nombre);
END//
DELIMITER ;
