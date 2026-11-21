package ec.edu.uta.monitor.model;

import java.time.Instant;

/** Evento de transición de estado (UP->DOWN, DOWN->UP o cambio del estado general). */
public record Alerta(
        long id,
        Instant timestamp,
        String componente,
        String estadoAnterior,
        String estadoNuevo,
        Severidad severidad,
        String mensaje) {

    public enum Severidad { INFO, ADVERTENCIA, CRITICA, RECUPERACION }
}
