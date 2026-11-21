package ec.edu.uta.monitor;

import java.util.List;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.config.MonitorProperties.Destino;
import ec.edu.uta.monitor.config.MonitorProperties.Logs;
import ec.edu.uta.monitor.model.TipoDestino;

/** Propiedades equivalentes a application.properties para pruebas unitarias. */
public final class TestSupport {
    private TestSupport() { }

    public static MonitorProperties props(String rutaLog) {
        return new MonitorProperties(5000, 2000, 2000, "America/Guayaquil", 20, 5,
                List.of(new Destino("nginx", TipoDestino.NGINX, "NGINX", "http://127.0.0.1:8090/nginx-ping", 8090, null, null),
                        new Destino("api-a", TipoDestino.BACKEND, "VEHICULOS_A", "http://127.0.0.1:8080/actuator/health", 8080, "127.0.0.1:8080", 3),
                        new Destino("api-b", TipoDestino.BACKEND, "VEHICULOS_B", "http://127.0.0.1:8082/actuator/health", 8082, "127.0.0.1:8082", 1),
                        new Destino("fastapi", TipoDestino.FASTAPI, "FastAPI", "http://127.0.0.1:8002/health", 8002, null, null)),
                new Logs(rutaLog));
    }

    /** Reproduce el log_format gateway sin fechas ni tiempo de conexión. */
    public static String linea(String metodo, String uri, int estado, String addr, String ustatus, String tiempos) {
        return """
                {"method":"%s","uri":"%s","status":%d,"upstream_addr":"%s","upstream_status":"%s","request_time":"0.014","upstream_response_time":"%s"}
                """.formatted(metodo, uri, estado, addr, ustatus, tiempos).strip();
    }

    public static ec.edu.uta.monitor.service.EstadoService.Ronda ronda(long numero,
            ec.edu.uta.monitor.model.EstadoComponente estadoB) {
        var p = props("no-usado");
        var fecha = java.time.Instant.ofEpochSecond(2000 + numero);
        var verificaciones = p.destinos().stream().map(d -> {
            var estado = d.id().equals("api-b") ? estadoB : ec.edu.uta.monitor.model.EstadoComponente.UP;
            boolean up = estado == ec.edu.uta.monitor.model.EstadoComponente.UP;
            return new ec.edu.uta.monitor.model.Verificacion(d.id(), d.nombre(), d.tipo(), d.url(), d.puerto(),
                    estado, up ? 200 : null, up ? 10L : null, fecha, "Resultado simulado de prueba");
        }).toList();
        return new ec.edu.uta.monitor.service.EstadoService.Ronda(numero, fecha, verificaciones.get(0),
                verificaciones.subList(1, 3), verificaciones.get(3), ec.edu.uta.monitor.model.EstadoGeneral.calcular(
                        verificaciones.get(0).estado(), verificaciones.subList(1, 3).stream()
                                .map(ec.edu.uta.monitor.model.Verificacion::estado).toList()));
    }
}
