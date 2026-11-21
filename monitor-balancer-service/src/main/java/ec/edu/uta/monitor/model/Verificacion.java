package ec.edu.uta.monitor.model;

import java.time.Instant;

/**
 * Resultado de UNA comprobación periódica: fecha/hora, destino, estado y latencia.
 * latenciaMs es null cuando el destino no devolvió ninguna respuesta HTTP.
 */
public record Verificacion(
        String destinoId,
        String nombre,
        TipoDestino tipo,
        String url,
        int puerto,
        EstadoComponente estado,
        Integer codigoHttp,
        Long latenciaMs,
        Instant fecha,
        String detalle) {
}
