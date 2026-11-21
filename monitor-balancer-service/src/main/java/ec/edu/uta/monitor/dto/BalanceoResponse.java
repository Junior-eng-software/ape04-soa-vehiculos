package ec.edu.uta.monitor.dto;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** GET /api/monitor/balanceo: distribución REAL calculada desde el access_log. */
@JsonPropertyOrder({"inicioVentana", "finVentana", "criterioVentana", "totalSolicitudes", "instancias",
        "sinUpstream", "solicitudesConReintento", "conciliacion", "nota", "integridad"})
public record BalanceoResponse(
        String inicioVentana,
        String finVentana,
        String criterioVentana,
        long totalSolicitudes,
        List<ConteoInstancia> instancias,
        ConteoSimple sinUpstream,
        long solicitudesConReintento,
        Conciliacion conciliacion,
        String nota,
        IntegridadLog integridad,
        String lecturaUTC,
        Map<String, Long> patronesReintento) {

    @JsonPropertyOrder({"etiqueta", "nombre", "upstream", "pesoConfigurado", "porcentajeTeorico",
            "solicitudes", "porcentajeReal"})
    public record ConteoInstancia(String etiqueta, String nombre, String upstream, Integer pesoConfigurado,
                                  double porcentajeTeorico, long solicitudes, double porcentajeReal) { }

    @JsonPropertyOrder({"solicitudes", "porcentajeReal", "descripcion"})
    public record ConteoSimple(long solicitudes, double porcentajeReal, String descripcion) { }

    @JsonPropertyOrder({"archivoLog", "lineasLeidas", "fueraDeVentana", "excluidasPorRuta", "lineasInvalidas",
            "otrosDestinos", "sumaAmasBmasSinUpstream", "cuadra"})
    public record Conciliacion(String archivoLog, long lineasLeidas, long fueraDeVentana, long excluidasPorRuta,
                               long lineasInvalidas, long otrosDestinos, long sumaAmasBmasSinUpstream,
                               boolean cuadra) { }
}
