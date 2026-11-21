package ec.edu.uta.monitor.dto;

import java.util.Map;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** GET /api/monitor/estadisticas */
@JsonPropertyOrder({"inicioVentana", "finVentana", "criterioVentana", "totalPeticiones", "respuestas2xx",
        "respuestas3xx", "respuestas4xx", "respuestas5xx", "porCodigo", "porMetodo", "tiempoPromedioMs",
        "tiempoPromedioUpstreamMs", "percentil95Ms", "tiempoMaximoMs", "integridad"})
public record EstadisticasResponse(
        String inicioVentana,
        String finVentana,
        String criterioVentana,
        long totalPeticiones,
        long respuestas2xx,
        long respuestas3xx,
        long respuestas4xx,
        long respuestas5xx,
        Map<String, Long> porCodigo,
        Map<String, Long> porMetodo,
        Double tiempoPromedioMs,
        Double tiempoPromedioUpstreamMs,
        Double percentil95Ms,
        Double tiempoMaximoMs,
        IntegridadLog integridad,
        String lecturaUTC) { }
