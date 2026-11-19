# API de Ventas y Compradores — Python FastAPI

**Autor:** Javier Vargas

## 1. Software necesario

- Windows 10 u 11 y Visual Studio Code.
- Python 3.13 con `pip` y `venv`.
- MySQL o XAMPP con el esquema independiente `ventas_api` disponible.
- API Java de vehículos en `http://127.0.0.1:8080`.
- Servicio Java de notificaciones en `http://127.0.0.1:8081` para comprobar avisos.

## 2. Preparar el proyecto

1. Se descarga o clona `soa-ventas-python` y se abre la carpeta que contiene `requirements.txt` y `alembic.ini`.
2. Se abre PowerShell y se crea el entorno virtual:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3. Se copia y configura el archivo local de variables:

```powershell
Copy-Item .env.example .env
notepad .env
```

4. En `.env` se configura `DB_NAME=ventas_api`, una cuenta de aplicación restringida a compradores/ventas, las direcciones de Java y notificaciones, `VENTAS_SERVICE_KEY` y `NOTIFICACIONES_KEY`. Las claves deben coincidir con la configuración privada de los servicios Java.
5. Para una instalación vacía, un DBA ejecuta `sql/001_schema.sql`; el script rechaza un esquema ya existente. Después se aplican las migraciones con una cuenta DBA/de migración, mediante `DB_USER` y `DB_PASSWORD` en el entorno del proceso. Estas variables tienen prioridad sobre `.env`: no sustituir las credenciales privadas de la aplicación ni escribir contraseñas en comandos o archivos versionados. Alembic exige `DB_NAME=ventas_api`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

La revisión final es `0002` (`alembic current`). Retirar las variables administrativas del entorno antes de iniciar la API. La cuenta de aplicación no dispone de permisos DDL ni administra `alembic_version`.

Si hay datos legados, no basta con crear tablas: respaldar y comprobar restauración, suspender escrituras y ejecutar `sql/002_copiar_legado.sql` únicamente sobre un destino vacío ya migrado. Comparar todos los campos y secuencias antes del corte; conservar el origen. No ejecutar `downgrade` ni repetir la copia sobre un destino con datos. El DBA prepara los roles con `../sql/003_permisos_servicios.sql` y los asigna como roles predeterminados a cuentas separadas, sin privilegios globales. La preparación inicial no se repite sobre instalaciones existentes.

## 3. Comprobar el código

```powershell
.\.venv\Scripts\python.exe -m compileall app alembic
```

## 4. Ejecutar la API

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002 --reload
```

Se comprueba `http://127.0.0.1:8002/health` y se revisan los endpoints en `http://127.0.0.1:8002/docs`.

## 5. Ejecutar el proceso de recuperación (cuando corresponda)

En otra terminal, desde la misma carpeta:

```powershell
.\.venv\Scripts\python.exe -m app.worker
```

Se detienen los procesos con `Ctrl + C`. El archivo `.env` no se publica en Git.

> Para la integración de avisos se comprueba que el receptor Java acepte la cabecera `X-Notification-Key`, tal como la envía esta API.
