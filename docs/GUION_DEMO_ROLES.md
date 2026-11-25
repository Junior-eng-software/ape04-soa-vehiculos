# Guion de demostración de roles y usuarios

Ejecutar la demostración en un entorno aislado con una cuenta inicial de perfil
`ADMIN`, dos vehículos disponibles y un comprador visible para cada cuenta que
registrará una venta. El DBA aplica los scripts al entorno que corresponda.
Preparar claves de prueba de al menos ocho caracteres y hasta 72 bytes y
mantenerlas junto con los JWT fuera de archivos versionados y capturas.

## Orden de aplicación para el DBA

1. En una instalación de Java existente, verificar con
   `SHOW CREATE TABLE venta_vehiculos.usuarios_api;` que el CHECK anterior se
   llama `chk_usuarios_api_rol`. Si el esquema difiere, revisar la diferencia
   antes de aplicar. En una instalación vacía, ejecutar primero
   [001_schema.sql](../java_venta-vehiculos-api_security/sql/001_schema.sql) y
   [002_vehiculo_color_opcional.sql](../java_venta-vehiculos-api_security/sql/002_vehiculo_color_opcional.sql).
2. Suspender las escrituras sobre `usuarios_api` mientras se aplica
   [003_roles_usuarios.sql](../java_venta-vehiculos-api_security/sql/003_roles_usuarios.sql).
   La migración crea y siembra `roles`, convierte variantes del nombre que
   admitía el CHECK anterior a sus nombres canónicos y sustituye el CHECK por
   una FK. MariaDB confirma el DDL de forma implícita. Si falla, inspeccionar el
   estado del esquema antes de reintentar.
3. Una vez que existen `ventas_api.compradores` y `ventas_api.ventas`, aplicar
   [003_permisos_servicios.sql](../sql/003_permisos_servicios.sql).
   En una instalación vacía de Ventas, el DBA prepara previamente
   [el esquema Python](../python_ventas-api/sql/001_schema.sql) y las tablas con
   `alembic upgrade head` apuntando explícitamente a la instancia autorizada y a
   `ventas_api`. Para una instalación con esas tablas, el paso de Alembic ya está
   cubierto. Comprobar con `SHOW GRANTS FOR ape04_java_runtime;` que el rol de
   ejecución tiene `SELECT, INSERT, UPDATE` en `usuarios_api` y `SELECT, INSERT`
   en `roles`. Si corresponde, asignar el rol y establecerlo como predeterminado
   para la cuenta privada de Java.
4. Desplegar la versión de Java en ambas instancias después de la migración.
   Validar NGINX con `nginx -t`, cargar su configuración y publicar la PWA
   actualizada. Abrir la PWA y comprobar que una cuenta de sistema conserva su
   acceso.

## A1 y A3 · Crear roles y usuarios

1. Abrir la PWA, escribir el usuario y la contraseña de la cuenta de prueba
   administradora y pulsar **Iniciar sesión**. El encabezado muestra el usuario
   y el rol propio. Debe aparecer **Administración**.
2. En **Administración → Crear rol**, ingresar `VENDEDOR`, elegir
   `OPERADOR` en **Perfil base**, completar **Descripción** y pulsar
   **Crear rol**. Verificar el mensaje de confirmación y que `VENDEDOR`
   aparece en el selector **Rol** de **Crear usuario**.
3. En **Administración → Crear usuario**, completar cada fila y pulsar
   **Crear usuario** después de ingresar la contraseña privada de prueba.

   | Usuario | Rol del selector |
   |---|---|
   | `consulta_demo` | `CONSULTA` |
   | `operador_demo` | `OPERADOR` |
   | `vendedor_demo` | `VENDEDOR` |

4. Repetir el alta de `VENDEDOR` y de `vendedor_demo`. La PWA debe presentar
   HTTP 409 en ambos casos.
5. Pulsar **Cerrar sesión** e iniciar sesión como `vendedor_demo`. Confirmar
   que se muestra `vendedor_demo · VENDEDOR` y que **Administración** queda
   oculta. En **Registrar venta**, elegir un vehículo disponible y un comprador,
   y pulsar **Registrar venta**. Conservar el ID para **Estado de una venta**.
6. Con el token de esa sesión, obtenido únicamente para la prueba local,
   verificar en un cliente HTTP contra el gateway `GET /api/usuarios`,
   `GET /api/roles` y `DELETE /api/vehiculos/{id}`. Usar en el DELETE
   un ID positivo que se haya verificado como inexistente en el entorno
   aislado. Los tres deben responder HTTP 403.
7. Cerrar sesión e iniciar como `consulta_demo`. Confirmar que el catálogo
   funciona y que **Registrar venta** está deshabilitado, con el mensaje del
   perfil `CONSULTA`. Verificar por HTTP `POST /api/ventas` usando la sesión
   de la PWA, un cuerpo válido con `vehiculoId` y `compradorId` y una
   `Idempotency-Key` de prueba nueva. Debe responder HTTP 403.
8. Cerrar sesión e iniciar como `operador_demo`. Confirmar que se muestra
   `operador_demo · OPERADOR` y repetir **Registrar venta** con el segundo
   vehículo y el comprador correspondiente. El perfil mantiene su flujo
   de ventas y **Administración** queda oculta.

## A2 · Restablecer la contraseña

1. Cerrar sesión y volver a ingresar como ADMIN. En **Administración →
   Restablecer contraseña**, elegir `vendedor_demo · VENDEDOR`, ingresar
   una nueva contraseña privada y pulsar **Restablecer contraseña**.
2. Cerrar sesión. Intentar ingresar como `vendedor_demo` con la contraseña
   anterior y verificar el rechazo HTTP 401. Repetir con la nueva y comprobar
   que se muestra `vendedor_demo · VENDEDOR`.

El restablecimiento se aplica a otro usuario. La prueba de la clave anterior
se hace mediante un nuevo inicio de sesión, ya que los JWT emitidos conservan
su vencimiento.

## SELECT de verificación

```sql
-- Los tres roles de sistema conservan su base. VENDEDOR tiene base OPERADOR.
SELECT nombre, rol_base, es_sistema
FROM venta_vehiculos.roles
WHERE nombre IN ('CONSULTA', 'OPERADOR', 'ADMIN', 'VENDEDOR')
ORDER BY es_sistema DESC, nombre;

-- El hash se verifica por formato sin mostrar su valor.
SELECT u.username, u.rol AS rol_propio, r.rol_base,
       (CHAR_LENGTH(u.password) = 60 AND
        LEFT(u.password, 4) IN ('$2a$', '$2b$', '$2y$')) AS formato_bcrypt
FROM venta_vehiculos.usuarios_api AS u
JOIN venta_vehiculos.roles AS r ON r.nombre = u.rol
WHERE u.username IN ('consulta_demo', 'operador_demo', 'vendedor_demo')
ORDER BY u.username;

-- Esperado: 0.
SELECT COUNT(*) AS usuarios_sin_rol
FROM venta_vehiculos.usuarios_api AS u
LEFT JOIN venta_vehiculos.roles AS r ON r.nombre = u.rol
WHERE r.nombre IS NULL;

-- Esperado: la FK presente y el CHECK de tres valores ausente.
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'venta_vehiculos' AND table_name = 'usuarios_api'
  AND constraint_name IN ('chk_usuarios_api_rol', 'fk_usuarios_api_rol');

-- Verificar que las ventas de la demo quedaron a nombre del usuario correcto.
SELECT id, usuario, vehiculo_id, estado
FROM ventas_api.ventas
WHERE usuario IN ('consulta_demo', 'operador_demo', 'vendedor_demo')
ORDER BY id DESC;
```
