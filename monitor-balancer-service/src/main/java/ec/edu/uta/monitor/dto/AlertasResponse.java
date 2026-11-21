package ec.edu.uta.monitor.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** GET /api/monitor/alertas */
@JsonPropertyOrder({"maximoEnMemoria", "totalGeneradas", "devueltas", "nota", "alertas"})
public record AlertasResponse(
        int maximoEnMemoria,
        long totalGeneradas,
        int devueltas,
        String nota,
        List<AlertaDto> alertas) {

    @JsonPropertyOrder({"id", "timestamp", "componente", "estadoAnterior", "estadoNuevo", "cambio",
            "severidad", "mensaje"})
    public record AlertaDto(long id, String timestamp, String componente, String estadoAnterior,
                            String estadoNuevo, String cambio, String severidad, String mensaje) { }
}
