package ec.edu.uta.monitor.dto;

import java.util.List;

/** Diagnóstico común de ambos endpoints. Los conteos parciales solo incluyen registros válidos. */
public record IntegridadLog(String estado, boolean completa, long lineasLeidas, long registrosValidos,
                           long lineasInvalidas, long fueraDeVentana, long excluidasPorRuta,
                           long otrosDestinos, List<String> advertencias) {
    public IntegridadLog {
        advertencias = List.copyOf(advertencias);
    }
}
