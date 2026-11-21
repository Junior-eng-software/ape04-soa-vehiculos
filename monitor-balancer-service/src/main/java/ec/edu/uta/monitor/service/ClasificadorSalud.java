package ec.edu.uta.monitor.service;

import org.springframework.stereotype.Component;

import ec.edu.uta.monitor.client.SondaHttpClient.ResultadoSonda;
import ec.edu.uta.monitor.model.EstadoComponente;
import ec.edu.uta.monitor.model.TipoDestino;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Convierte el resultado HTTP crudo en UP / DOWN / ERROR_ACCESO.
 * Regla clave: NO toda respuesta distinta de 200 significa "servidor apagado".
 * Un 401/403/404 demuestra que el proceso está vivo pero mal configurado (ERROR_ACCESO).
 */
@Component
public class ClasificadorSalud {

    private final JsonMapper mapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    public record Clasificacion(EstadoComponente estado, String detalle) { }

    public Clasificacion clasificar(TipoDestino tipo, ResultadoSonda r) {
        if (!r.respondio()) {
            return new Clasificacion(EstadoComponente.DOWN, r.error());
        }
        int codigo = r.codigoHttp();
        if (codigo == 401 || codigo == 403) {
            return new Clasificacion(EstadoComponente.ERROR_ACCESO,
                    "HTTP " + codigo + ": el proceso responde pero niega el acceso (revisar SecurityConfig / allow-deny)");
        }
        if (codigo == 404) {
            return new Clasificacion(EstadoComponente.ERROR_ACCESO,
                    "HTTP 404: el proceso responde pero el endpoint de salud no está expuesto");
        }
        if (tipo == TipoDestino.NGINX) {
            return codigo == 200 && "pong".equals(r.cuerpo() == null ? "" : r.cuerpo().strip())
                    ? new Clasificacion(EstadoComponente.UP, "nginx-ping respondió 200")
                    : new Clasificacion(EstadoComponente.DOWN, "Respuesta de nginx-ping no válida (HTTP " + codigo + ")");
        }
        // BACKEND: se respeta la salud que reporta el propio proceso (Actuator)
        String status;
        try {
            JsonNode raiz = mapper.readTree(r.cuerpo() == null ? "" : r.cuerpo());
            if (raiz == null || !raiz.isObject()) {
                return new Clasificacion(EstadoComponente.DOWN, "HTTP " + codigo + ": salud sin objeto JSON raíz");
            }
            JsonNode campo = raiz.get("status");
            if (campo == null) {
                return new Clasificacion(EstadoComponente.DOWN, "HTTP " + codigo + ": falta status raíz de salud");
            }
            if (!campo.isString() || campo.asString().isBlank()) {
                return new Clasificacion(EstadoComponente.DOWN, "HTTP " + codigo + ": tipo/valor inválido de status raíz");
            }
            status = campo.asString();
            if (!java.util.Set.of("UP", "DOWN", "OUT_OF_SERVICE", "UNKNOWN").contains(status)) {
                return new Clasificacion(EstadoComponente.DOWN, "HTTP " + codigo + ": status raíz no reconocido");
            }
        } catch (RuntimeException ex) {
            return new Clasificacion(EstadoComponente.DOWN, "HTTP " + codigo + ": JSON de salud inválido");
        }
        if (codigo == 200 && "UP".equals(status)) {
            return new Clasificacion(EstadoComponente.UP, "status=UP");
        }
        if (codigo == 503) {
            return new Clasificacion(EstadoComponente.DOWN,
                    "HTTP 503: la instancia se reporta " + (status == null ? "DOWN" : status) + " (p. ej. sin BD)");
        }
        return new Clasificacion(EstadoComponente.DOWN,
                "HTTP " + codigo + (status == null ? "" : " status=" + status));
    }

}
