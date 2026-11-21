package ec.edu.uta.monitor.config;

import java.time.ZoneId;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import ec.edu.uta.monitor.model.TipoDestino;

/**
 * Configuración tipada del monitor (prefijo "monitor" en application.properties).
 * Todo es configurable: catálogo de destinos, timeouts, intervalo y ruta del log.
 */
@ConfigurationProperties(prefix = "monitor")
public record MonitorProperties(
        @DefaultValue("5000") long intervaloMs,
        @DefaultValue("2000") int timeoutConexionMs,
        @DefaultValue("2000") int timeoutLecturaMs,
        @DefaultValue("America/Guayaquil") String zonaHoraria,
        @DefaultValue("20") int maxAlertas,
        @DefaultValue("5") int historialPorDestino,
        List<Destino> destinos,
        @DefaultValue Logs logs) {
    public MonitorProperties {
        if (intervaloMs <= 0 || timeoutConexionMs <= 0 || timeoutLecturaMs <= 0 || maxAlertas <= 0) {
            throw new IllegalArgumentException("Intervalos, timeouts y límite de alertas deben ser positivos");
        }
        destinos = List.copyOf(destinos);
        if (destinos.stream().filter(d -> d.tipo() == TipoDestino.NGINX).count() != 1
                || destinos.stream().filter(d -> d.tipo() == TipoDestino.BACKEND).count() != 2
                || destinos.stream().filter(d -> d.tipo() == TipoDestino.FASTAPI).count() != 1) {
            throw new IllegalArgumentException("Se requiere un destino NGINX, dos Java y un FastAPI");
        }
    }

    /** Un destino del catálogo: NGINX (/nginx-ping) o BACKEND (/actuator/health). */
    public record Destino(
            String id,
            TipoDestino tipo,
            String nombre,
            String url,
            int puerto,
            String upstream,   // dirección tal como aparece en $upstream_addr (solo BACKEND)
            Integer peso) {
        public Destino {
            java.net.URI destino = java.net.URI.create(url);
            if (!List.of("http", "https").contains(destino.getScheme()) || destino.getHost() == null
                    || destino.getRawUserInfo() != null || destino.getRawQuery() != null || destino.getRawFragment() != null) {
                throw new IllegalArgumentException("URL de sonda HTTP(S) sin credenciales, consultas ni fragmentos requerida");
            }
        }
    }

    /** Lectura del access_log dedicado de NGINX. */
    public record Logs(
            @DefaultValue("C:/nginx/logs/ape04_access.log") String ruta) {
    }

    public ZoneId zona() {
        return ZoneId.of(zonaHoraria);
    }

    public Destino nginx() {
        return destinos.stream().filter(d -> d.tipo() == TipoDestino.NGINX).findFirst()
                .orElseThrow(() -> new IllegalStateException("El catálogo no tiene un destino NGINX"));
    }

    public Destino fastapi() {
        return destinos.stream().filter(d -> d.tipo() == TipoDestino.FASTAPI).findFirst().orElseThrow();
    }

    public List<Destino> backends() {
        return destinos.stream().filter(d -> d.tipo() == TipoDestino.BACKEND).toList();
    }
}
