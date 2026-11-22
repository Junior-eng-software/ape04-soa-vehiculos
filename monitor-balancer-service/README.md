# Monitor de disponibilidad y balanceo

Servicio adicional Spring Boot 4.1.1 sobre Java 17, con escucha académica en `127.0.0.1:8083`. Sondea NGINX, Java A/B y FastAPI. Lee el access log JSON de NGINX para calcular el reparto observado. Las alertas se guardan en memoria y se pierden al reiniciar.

## Compilación y pruebas

Desde este directorio, con `JAVA_HOME` apuntando al JDK 17:

```powershell
.\mvnw.cmd clean package
```

Maven Wrapper declara Maven 3.9.16. Las pruebas usan respuestas simuladas y logs temporales. Los servicios comerciales pueden permanecer activos mientras se compila.

## Configuración local

El archivo de ejecución `application.properties` está excluido por la regla general de Git. En una copia limpia, crear `config/application.properties` a partir de este bloque, o aplicar propiedades equivalentes a la instancia:

```properties
spring.application.name=monitor-balancer-service
server.port=8083
server.address=127.0.0.1
server.shutdown=graceful

monitor.intervalo-ms=5000
monitor.timeout-conexion-ms=2000
monitor.timeout-lectura-ms=2000
monitor.zona-horaria=America/Guayaquil

monitor.destinos[0].id=nginx
monitor.destinos[0].tipo=NGINX
monitor.destinos[0].nombre=NGINX
monitor.destinos[0].url=${MONITOR_NGINX_URL:http://127.0.0.1:8090/nginx-ping}
monitor.destinos[0].puerto=8090

monitor.destinos[1].id=api-a
monitor.destinos[1].tipo=BACKEND
monitor.destinos[1].nombre=VEHICULOS_A
monitor.destinos[1].url=${MONITOR_JAVA_A_URL:http://127.0.0.1:8080/actuator/health}
monitor.destinos[1].puerto=8080
monitor.destinos[1].upstream=127.0.0.1:8080
monitor.destinos[1].peso=3

monitor.destinos[2].id=api-b
monitor.destinos[2].tipo=BACKEND
monitor.destinos[2].nombre=VEHICULOS_B
monitor.destinos[2].url=${MONITOR_JAVA_B_URL:http://127.0.0.1:8082/actuator/health}
monitor.destinos[2].puerto=8082
monitor.destinos[2].upstream=127.0.0.1:8082
monitor.destinos[2].peso=1

monitor.destinos[3].id=fastapi
monitor.destinos[3].tipo=FASTAPI
monitor.destinos[3].nombre=FastAPI
monitor.destinos[3].url=${MONITOR_FASTAPI_URL:http://127.0.0.1:8002/health}
monitor.destinos[3].puerto=8002

monitor.logs.ruta=${MONITOR_NGINX_ACCESS_LOG:C:/nginx/logs/ape04_access.log}
```

Si cambia el entorno, ajustar tanto las URLs de sonda como los puertos y los upstreams usados para interpretar el log. Las variables `MONITOR_*` del bloque anterior permiten seleccionar las URLs y el access log.

## Arranque y consulta

```powershell
java -jar target/monitor-balancer-service-0.0.1-SNAPSHOT.jar
```

Spring Boot carga el archivo en `./config` cuando se ejecuta desde este directorio. Se puede iniciar después de NGINX y de los backends. En una consola dedicada, usar Ctrl+C para detenerlo.

```powershell
$api = 'http://127.0.0.1:8083/api/monitor'
Invoke-RestMethod "$api/estado"
Invoke-RestMethod "$api/instancias"
Invoke-RestMethod "$api/balanceo"
Invoke-RestMethod "$api/estadisticas"
Invoke-RestMethod "$api/alertas"
```

`estadoGeneral` resume la salud de Java A/B y NGINX. Revisar también `fastapi.estado` y su alerta individual. El log de NGINX carece de timestamp por solicitud; para una muestra concreta, documentar sus líneas y el intervalo medido por separado. El porcentaje observado puede variar por fallos de upstream y tamaño de muestra.
