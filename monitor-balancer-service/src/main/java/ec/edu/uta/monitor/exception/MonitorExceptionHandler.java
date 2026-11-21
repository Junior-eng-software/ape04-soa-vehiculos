package ec.edu.uta.monitor.exception;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import ec.edu.uta.monitor.dto.IntegridadLog;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Errores del propio monitor en JSON con código HTTP apropiado. */
@RestControllerAdvice
public class MonitorExceptionHandler {

    @ExceptionHandler(LogNoDisponibleException.class)
    public ResponseEntity<Map<String, Object>> logNoDisponible(LogNoDisponibleException ex) {
        var respuesta = cuerpo(HttpStatus.SERVICE_UNAVAILABLE, "LOG_NO_DISPONIBLE", ex.getMessage());
        respuesta.getBody().put("diagnostico", new IntegridadLog(ex.getMotivo(), false, 0, 0, 0, 0, 0, 0,
                java.util.List.of("No se publican métricas: no se pudo completar la lectura")));
        return respuesta;
    }

    @ExceptionHandler(LogInvalidoException.class)
    public ResponseEntity<Map<String, Object>> logInvalido(LogInvalidoException ex) {
        var respuesta = cuerpo(HttpStatus.valueOf(422), "LOG_INVALIDO", ex.getMessage());
        respuesta.getBody().put("diagnostico", ex.getDiagnostico());
        return respuesta;
    }

    @ExceptionHandler(VentanaInvalidaException.class)
    public ResponseEntity<Map<String, Object>> ventanaInvalida(VentanaInvalidaException ex) {
        return cuerpo(HttpStatus.BAD_REQUEST, "VENTANA_INVALIDA", ex.getMessage());
    }

    private ResponseEntity<Map<String, Object>> cuerpo(HttpStatus status, String codigo, String mensaje) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("timestamp", OffsetDateTime.now().withNano(0).toString());
        m.put("status", status.value());
        m.put("error", codigo);
        m.put("mensaje", mensaje);
        return ResponseEntity.status(status).body(m);
    }
}
