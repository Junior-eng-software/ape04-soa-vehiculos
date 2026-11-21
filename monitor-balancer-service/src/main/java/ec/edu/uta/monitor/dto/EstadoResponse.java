package ec.edu.uta.monitor.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** GET /api/monitor/estado */
@JsonPropertyOrder({"fechaConsulta", "ultimaRevision", "ronda", "nginx", "nginxLatenciaMs",
        "estadoGeneral", "resumen", "instancias", "fastapi"})
public record EstadoResponse(
        String fechaConsulta,
        String ultimaRevision,
        long ronda,
        String nginx,
        Long nginxLatenciaMs,
        String estadoGeneral,
        String resumen,
        List<InstanciaResumen> instancias,
        InstanciaResumen fastapi) {

    @JsonPropertyOrder({"nombre", "puerto", "estado", "latenciaMs"})
    public record InstanciaResumen(String nombre, int puerto, String estado, Long latenciaMs) { }
}
