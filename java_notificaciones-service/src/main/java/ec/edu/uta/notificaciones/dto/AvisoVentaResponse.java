package ec.edu.uta.notificaciones.dto;

import java.time.Instant;

public record AvisoVentaResponse(String eventoId, int ventaId, Instant fechaUTC, String estado) {}
