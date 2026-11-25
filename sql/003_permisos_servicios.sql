-- Preparacion futura por DBA. Solo MariaDB (version comprobada: 10.4).
-- Ejecutar despues de preparar tablas y aplicar 003_roles_usuarios.sql de Java.
-- No usar cuentas con privilegios globales para ejecutar los servicios.
CREATE ROLE IF NOT EXISTS ape04_java_runtime;
CREATE ROLE IF NOT EXISTS ape04_ventas_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON venta_vehiculos.vehiculos TO ape04_java_runtime;
GRANT SELECT, INSERT, UPDATE ON venta_vehiculos.usuarios_api TO ape04_java_runtime;
GRANT SELECT, INSERT ON venta_vehiculos.roles TO ape04_java_runtime;
GRANT SELECT, INSERT, UPDATE ON venta_vehiculos.reservas TO ape04_java_runtime;
GRANT SELECT ON venta_vehiculos.historial_precios TO ape04_java_runtime;
GRANT SELECT, INSERT ON ventas_api.compradores TO ape04_ventas_runtime;
GRANT SELECT, INSERT, UPDATE ON ventas_api.ventas TO ape04_ventas_runtime;
-- DBA: crear dos cuentas privadas nuevas con contrasenas seguras fuera del repositorio.
-- Asignar UN rol a cada cuenta y establecerlo como DEFAULT ROLE.
-- No reutilizar cuentas globales; comprobar SHOW GRANTS y pruebas de denegacion cruzada.
-- La cuenta de migracion/DBA es independiente: no otorgar DDL ni lectura del origen al runtime.
-- Tras aprobar el corte, configurar credenciales privadas y probar conexiones nuevas.
