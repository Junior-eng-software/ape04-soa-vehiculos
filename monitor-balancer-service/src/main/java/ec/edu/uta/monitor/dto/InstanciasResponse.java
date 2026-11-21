package ec.edu.uta.monitor.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** GET /api/monitor/instancias */
@JsonPropertyOrder({"ultimaRevision", "intervaloMs", "timeoutConexionMs", "timeoutLecturaMs", "nginx", "instancias", "fastapi"})
public record InstanciasResponse(
        String ultimaRevision,
        long intervaloMs,
        int timeoutConexionMs,
        int timeoutLecturaMs,
        InstanciaDetalle nginx,
        List<InstanciaDetalle> instancias,
        InstanciaDetalle fastapi) {

    @JsonPropertyOrder({"nombre", "tipo", "puerto", "url", "estado", "codigoHttp", "latenciaMs",
            "ultimaRevision", "detalle", "historialReciente"})
    public record InstanciaDetalle(
            String nombre,
            String tipo,
            int puerto,
            String url,
            String estado,
            Integer codigoHttp,
            Long latenciaMs,
            String ultimaRevision,
            String detalle,
            List<VerificacionDto> historialReciente) { }

    @JsonPropertyOrder({"fecha", "estado", "codigoHttp", "latenciaMs"})
    public record VerificacionDto(String fecha, String estado, Integer codigoHttp, Long latenciaMs) { }
}
