# APE 04 · Integración de vehículos, ventas y notificaciones

Windows Forms, React, PWA y JavaFX consumen las API a través de NGINX. Java administra vehículos, reservas e identidad. FastAPI administra compradores y ventas, y registra los eventos confirmados en una Outbox transaccional. Un publicador independiente envía los eventos a RabbitMQ. Java Notificaciones los consume de forma idempotente y expone el historial.

| Proyecto | Servicio o cliente | Puerto local |
|---|---|---|
| [Java Vehículos](java_venta-vehiculos-api_security/README.md) | Identidad JWT, vehículos y reservas; dos instancias con la misma configuración privada | 8080, 8082 |
| [FastAPI](python_ventas-api/README.md) | Compradores, ventas, consulta de estado e idempotencia | 8002 |
| [Java Notificaciones](java_notificaciones-service/README.md) | Consumidor AMQP e historial para ADMIN | 8081 |
| [Monitor](monitor-balancer-service/README.md) | Salud, alertas y distribución A/B desde los registros de NGINX | 8083 |
| [PWA](AplicacionMovilPWA/README.md) | Inicio de sesión, catálogo y único cliente que registra ventas | 5173 |
| [React](AplicacionWebREACT/react-fetch-vehiculos/README.md) | Catálogo, detalle y panel de ventas en modo consulta | 5174 |
| [Windows Forms](AplicacionEscritorioWINDOWS_FORMS/README.md) | Administración de vehículos y compradores; consulta de ventas | — |
| [JavaFX](AplicacionEscritorioJAVA_FX/consultarvehiculojavafx/README.md) | Catálogo y avisos por sondeo | — |

## Requisitos

Entorno comprobado en Windows con PowerShell 7, Temurin JDK 17.0.18+8, Maven 3.9.16, Python 3.12.10, Node 24.13.0, herramientas .NET compatibles con el objetivo `net8.0-windows`, MariaDB 10.4.32, RabbitMQ 4.3.5 y NGINX 1.30.5. Los manifiestos declaran Spring Boot 4.1.1 para Vehículos y Monitor, Spring Boot 3.5.6 para Notificaciones y JavaFX 21.0.13. React queda fijado en 19.3.1 y Vite en 8.3.8 por el lockfile. Los rangos de Python se resuelven al instalar; en el entorno académico se comprobó FastAPI 0.165.0 y Uvicorn 0.54.0.

## Preparar una instalación vacía

1. En MariaDB, usar una cuenta de inicialización autorizada. Aplicar [001 de Vehículos](java_venta-vehiculos-api_security/sql/001_schema.sql) y luego [002](java_venta-vehiculos-api_security/sql/002_vehiculo_color_opcional.sql). El esquema es `venta_vehiculos`; la revisión 002 hace nullable la columna `color`.
2. Crear `ventas_api` con [001 de FastAPI](python_ventas-api/sql/001_schema.sql). Desde `python_ventas-api`, preparar el entorno virtual e instalar los requisitos. Configurar la conexión de migración para `ventas_api` y ejecutar `.\.venv\Scripts\python.exe -m alembic upgrade head`. Verificar la revisión con `.\.venv\Scripts\python.exe -m alembic current`; el destino de esta entrega es `0004`.
3. Crear `notificaciones_api` y sus tablas con [001 de Notificaciones](java_notificaciones-service/sql/001_notificaciones.sql). Separar las cuentas de migración de las cuentas de ejecución. [003 de permisos](sql/003_permisos_servicios.sql) es una base para el DBA y requiere completar el acceso de ejecución a `ventas_outbox` (SELECT, INSERT y UPDATE) y a las tablas de notificaciones y cuarentena (SELECT e INSERT).
4. Provisionar las identidades de prueba de Vehículos en `usuarios_api` con hashes BCrypt y roles autorizados. Los scripts de esquema crean tablas vacías.
5. Activar RabbitMQ Management en 15672; el puerto AMQP es 5672. Desde el repositorio, aplicar la topología con credenciales suministradas en el momento.

```powershell
.\rabbitmq\aplicar-ape04.ps1 -Administrador (Get-Credential) `
  -Integracion (Get-Credential -UserName ape04-integracion) `
  -Consulta (Get-Credential -UserName ape04-consulta)
```

El script prepara el vhost `ape04`, el exchange `ventas`, la ruta `venta.confirmada` y la cola `notificaciones.ventas`. Una instalación vacía empieza sin operaciones. En el entorno académico ya existen ventas en revisión y avisos históricos pendientes. [002 de copia legada](python_ventas-api/sql/002_copiar_legado.sql) corresponde a un corte controlado de una instalación previa. Dejar los esquemas y colas operativos intactos cuando solo se prepare una compilación o evidencia.

### Configuración privada

| Componente | Nombres y ubicación |
|---|---|
| Java Vehículos | Entorno o `java_venta-vehiculos-api_security/config/application-local.properties`. `VEHICULOS_DB_USER`, `VEHICULOS_DB_PASSWORD`, `VEHICULOS_JWT_SECRET`, `VEHICULOS_CLIENT_SECRET`, `VEHICULOS_PWA_CLIENT_ID`, `VEHICULOS_PWA_CLIENT_SECRET`, `VENTAS_SERVICE_KEY`, `NOTIFICACIONES_KEY`, `VEHICULOS_NOTIFICACIONES_DESTINATARIO`. La misma clave JWT y configuración de clientes se usa en A y B. |
| FastAPI y publicador | `python_ventas-api/.env` privado. `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JAVA_URL`, `VENTAS_SERVICE_KEY`, `NOTIFICACIONES_URL`, `NOTIFICACIONES_KEY`, `OUTBOX_VENTAS_ACTIVA` y `AMQP_HOST`, `AMQP_PORT`, `AMQP_VHOST`, `AMQP_USER`, `AMQP_PASSWORD`. |
| Java Notificaciones | Entorno o `java_notificaciones-service/config/application-local.properties`. `NOTIFICACIONES_DB_HOST`, `NOTIFICACIONES_DB_PORT`, `NOTIFICACIONES_DB_USER`, `NOTIFICACIONES_DB_PASSWORD`, `NOTIFICACIONES_KEY`, `NOTIFICACIONES_IDENTIDAD_URL`, `NOTIFICACIONES_AMQP_ACTIVO` y las cinco variables `AMQP_*` anteriores. |
| PWA | `AplicacionMovilPWA/.env` del servidor Node. `VEHICULOS_PWA_CLIENT_ID`, `VEHICULOS_PWA_CLIENT_SECRET`, `API_BASE_URL`, `HOST`, `PORT`. El navegador recibe el JWT de sesión; el servidor conserva las credenciales del cliente PWA. |
| Monitor | [Configuración local y variables](monitor-balancer-service/README.md#configuración-local). |

La [plantilla FastAPI](python_ventas-api/.env.example) identifica los campos. Revisar y sustituir en la copia privada los literales de `DB_PASSWORD`, `VENTAS_SERVICE_KEY` y `NOTIFICACIONES_KEY`. Mantener fuera de Git los archivos privados, respaldos, JWT y capturas que expongan credenciales.

## Compilar y probar

Ejecutar los comandos desde el directorio de cada proyecto. Usar un checkout limpio y una instancia MariaDB desechable para la prueba de contexto de Vehículos `VentaVehiculosApiApplicationTests`; el resto de sus pruebas puede ejecutarse sin MariaDB con `-Dtest=VehiculoReglasTest,PermisoVentaTest`. Notificaciones usa H2 y dobles, y FastAPI usa SQLite temporal y dobles HTTP/AMQP. Ejecutar PWA y JavaFX solo en el contexto de las pruebas de terminal; sus pruebas HTTP usan puertos efímeros locales.

| Proyecto | Compilación y pruebas |
|---|---|
| Java Vehículos | `.\mvnw.cmd clean package` |
| Java Notificaciones | `mvn clean package` |
| FastAPI | `py -3.12 -m venv .venv`; `.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt`; `.\.venv\Scripts\python.exe -m pytest -q` |
| Windows Forms (directorio padre) | `dotnet restore .\ConsultaVehiculosWinForms.sln`; `dotnet build .\ConsultaVehiculosWinForms.sln -c Release --no-restore`. La solución versionada contiene la aplicación; los arneses históricos no forman parte de la solución. |
| React | `npm ci`; `npm run lint`; `node --test`; `npm run build` |
| PWA | `npm test`; `npm run build`. Esta PWA usa módulos nativos de Node y no declara paquetes externos. |
| JavaFX | `mvn clean package` |
| Monitor | `.\mvnw.cmd clean package` |

## Orden de arranque

1. MariaDB y RabbitMQ, después de verificar los esquemas, permisos y la topología.
2. En dos terminales, desde el proyecto Java Vehículos, iniciar `java -jar target/venta-vehiculos-api-0.0.1-SNAPSHOT.jar --server.port=8080` y repetir con `8082`.
3. Desde FastAPI, iniciar `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8002`. Cuando MariaDB y RabbitMQ estén disponibles, habilitar la Outbox con la configuración privada y arrancar **un** publicador independiente con `.\.venv\Scripts\python.exe -m app.publicador_outbox`.
4. Desde Java Notificaciones, iniciar `java -jar target/notificaciones-service-0.0.1-SNAPSHOT.jar`. Habilitar `NOTIFICACIONES_AMQP_ACTIVO=true` después de preparar JDBC y RabbitMQ.
5. Instalar [la configuración NGINX](nginx/nginx.conf) en el prefijo local de NGINX (por ejemplo, `C:\nginx\conf\nginx.conf`). Desde ese prefijo ejecutar `.\nginx.exe -p C:/nginx/ -c conf/nginx.conf -t` y luego `.\nginx.exe -p C:/nginx/ -c conf/nginx.conf`. La puerta de entrada en `127.0.0.1:8090` enruta a Java con pesos 3:1 y a FastAPI y Notificaciones en sus rutas. `/nginx-ping` responde en NGINX; el estado de cada backend se verifica aparte.
6. Iniciar el [monitor](monitor-balancer-service/README.md), PWA con `npm start` y React con `npm run dev -- --port 5174 --strictPort`. En las sesiones que requieran los clientes de escritorio, usar `dotnet run --project .\ConsultaVehiculosWinForms\ConsultaVehiculosWinForms.csproj` desde el directorio padre de Windows Forms y `mvn javafx:run` desde JavaFX.

`app.worker` es el conciliador comercial y se mantiene detenido en el escenario académico. Ejecutarlo solo durante un proceso de conciliación autorizado, con alcance comprobado. El publicador Outbox procesa registros Outbox existentes; no requiere el conciliador para publicar una venta confirmada.

## Detención y límites

Cerrar los clientes; en un apagado completo, detener Uvicorn y los JVM en sus consolas dedicadas con Ctrl+C y verificar sus puertos. Permitir que el publicador vacíe la Outbox y comprobar `Ready` y `Unacked` antes de cerrar AMQP. Desde el mismo prefijo de NGINX, usar `.\nginx.exe -p C:/nginx/ -c conf/nginx.conf -s quit` para un cierre ordenado cuando corresponda. En una prueba de fallos, identificar PID, comando y consola antes de detener solo el servicio autorizado.

Los listados dependen del rol y la propiedad de los registros. En el entorno académico quedan pendientes los casos con cuentas OPERADOR y CONSULTA no disponibles y el rechazo de un JWT legítimo vencido en servicios activos; ese rechazo se comprobó de forma aislada. La prueba del balanceo se interpreta desde NGINX y el log, y la monitorización no reemplaza las verificaciones comerciales.
