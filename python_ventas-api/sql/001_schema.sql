-- Preparacion futura autorizada por DBA, antes de Alembic. No modifica el origen.
CREATE DATABASE ventas_api CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Ejecutar desde python_ventas-api con DB_NAME=ventas_api solo en el proceso Alembic:
-- python -m alembic upgrade head
-- No cambiar el .env de la API hasta completar copia, validacion y autorizacion de corte.
