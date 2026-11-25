# Demo de anulación y reventa

Usar un entorno aislado con una cuenta de perfil base ADMIN, un comprador
visible y un vehículo disponible. Crear una venta nueva desde la PWA para
esta demostración. Registrar los ID que produzca la demo y reservar la venta
15 para sus datos originales.

## Orden de aplicación para el DBA

1. Completar los prerrequisitos de Vehículos y de Ventas del
   [guion de roles](GUION_DEMO_ROLES.md). En el esquema existente comprobar
   `SHOW CREATE TABLE venta_vehiculos.reservas` y la presencia de
   `ck_reserva_estado`.
2. Aplicar [004_reservas_anuladas.sql](../java_venta-vehiculos-api_security/sql/004_reservas_anuladas.sql)
   para admitir `ANULADA` en reservas. Desplegar el Java actualizado en
   ambas instancias del gateway.
3. Con la conexión del DBA apuntando a `ventas_api`, aplicar
   [Alembic 0005](../python_ventas-api/alembic/versions/0005_anulacion_ventas.py)
   mediante `alembic upgrade 0005`. Desde la revisión `0004`, el DBA puede
   aplicar [el SQL exportado](../python_ventas-api/sql/003_anulacion_ventas_desde_0004.sql)
   con `alembic upgrade 0004:0005 --sql`. Elegir un método y consultar
   `SELECT version_num FROM ventas_api.alembic_version` antes y después.
   El estado de ventas ya es `VARCHAR(20)` sin CHECK ni enum en las
   revisiones anteriores. El downgrade automático se deshabilitó para
   conservar la auditoría de las anulaciones.
4. Revisar [los GRANT de ejecución](../sql/003_permisos_servicios.sql).
   `SELECT, INSERT, UPDATE` sobre `ventas_api.ventas` cubren el bloqueo y las
   columnas de auditoría. El DELETE HTTP conserva la fila. Si se usa Outbox,
   el rol de ejecución necesita además el acceso a `ventas_outbox` definido
   en la preparación del proyecto. Desplegar FastAPI y después la PWA.

El evento histórico `VENTA_CONFIRMADA` y sus avisos siguen vinculados a la
venta original. La anulación no publica otro evento. La reventa registra
su propio `VENTA_CONFIRMADA`.

## Crear, eliminar y revender desde la PWA

1. Iniciar sesión como ADMIN. En **Registrar venta**, elegir un vehículo de
   **Vehículos disponibles** y un comprador. Pulsar **Registrar venta** y
   esperar **Completada**. Anotar el ID nuevo de venta y el ID del vehículo.
   En **Ventas**, con **Incluir ventas anuladas** desmarcado, verificar que
   la venta aparece y el vehículo ya no figura entre los disponibles.
   Ejecutar los tres SELECT de abajo con `@venta_nueva` en `NULL`.
2. En la fila de la venta, pulsar **Eliminar** y confirmar. Si se recibe
   HTTP 202, la fila indica **Anulación pendiente** y permite **Reintentar
   anulación**. Un 409 se muestra como conflicto y requiere comprobar el
   estado de la venta antes de volver a intentar.
3. Cuando la anulación se confirma, verificar que el listado normal ya
   omite la venta y que el vehículo vuelve a **Vehículos disponibles**.
   Marcar **Incluir ventas anuladas** y comprobar que el mismo listado
   muestra la venta original como **Anulada**, mediante
   `GET /api/ventas?incluirAnuladas=true`. **Estado de una venta**, consultado
   por ID, también devuelve **Anulada**. Ejecutar de nuevo los tres SELECT.
4. Desmarcar el filtro. Elegir el mismo vehículo y pulsar **Registrar venta**
   con un comprador válido. La PWA genera una clave de idempotencia nueva.
   Anotar el segundo ID y repetir los tres SELECT. Una repetición de la
   primera solicitud con su clave y cuerpo originales devuelve HTTP 409
   con `VENTA_ANULADA`.

## SELECT antes y después

En la primera ejecución, sustituir los `NULL` de `@vehiculo` y
`@venta_original` por los ID anotados en la PWA. Tras revender, sustituir
también el `NULL` de `@venta_nueva`.

```sql
SET @vehiculo = NULL;
SET @venta_original = NULL;
SET @venta_nueva = NULL;

SELECT id, estado, vehiculo_id, anulada_utc, anulada_por
FROM ventas_api.ventas
WHERE id IN (@venta_original, @venta_nueva)
  AND vehiculo_id = @vehiculo
ORDER BY id;

SELECT id, estado, operacion_id
FROM venta_vehiculos.reservas
WHERE vehiculo_id = @vehiculo
  AND operacion_id IN (
    SELECT operacion_id
    FROM ventas_api.ventas
    WHERE id IN (@venta_original, @venta_nueva)
  )
ORDER BY estado;

SELECT id_vehiculo, estado
FROM venta_vehiculos.vehiculos
WHERE id_vehiculo = @vehiculo;
```

| Momento | Ventas | Reservas | Vehículo |
|---|---|---|---|
| Antes de anular | Una `COMPLETADA`, con auditoría de anulación nula | Una `CONFIRMADA` | `VENDIDO` |
| Después de anular | La misma `ANULADA`, con fecha UTC y usuario ADMIN | La misma `ANULADA` | `DISPONIBLE` |
| Después de revender | Dos ID distintos, una `ANULADA` y otra `COMPLETADA` | Dos ID y operaciones distintos, una `ANULADA` y otra `CONFIRMADA` | `VENDIDO` |

## Pruebas aisladas

Las pruebas FastAPI usan SQLite y dobles HTTP. Para incluir el doble DELETE
con bloqueo real, definir `VENTAS_TEST_DB_DATADIR`,
`VENTAS_TEST_DB_PORT`, `VENTAS_TEST_DB_USER` y `VENTAS_TEST_DB_PASSWORD`
para una MariaDB desechable en loopback con Alembic 0005, y ejecutar
`python -m pytest -q`. La prueba verifica `@@datadir` antes de escribir y
retira sus propias filas al terminar.
