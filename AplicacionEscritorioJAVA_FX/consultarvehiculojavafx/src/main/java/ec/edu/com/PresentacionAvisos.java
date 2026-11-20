package ec.edu.com;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;

final class PresentacionAvisos {
    private static final DateTimeFormatter FECHA_LOCAL = DateTimeFormatter
        .ofPattern("dd/MM/uuuu HH:mm:ss", Locale.ROOT)
        .withZone(ZoneId.of("America/Guayaquil"));

    enum Estado {
        SIN_SESION, CARGA, VACIO, EXITO, ERROR, JWT_RECHAZADO, ACCESO_DENEGADO
    }

    static Estado estado(NotificacionesApiClient.Resultado resultado, Throwable error) {
        if (error != null) {
            return Estado.ERROR;
        }
        return switch (resultado.codigoHttp()) {
            case 200 -> resultado.avisos().isEmpty() ? Estado.VACIO : Estado.EXITO;
            case 401 -> Estado.JWT_RECHAZADO;
            case 403 -> Estado.ACCESO_DENEGADO;
            default -> Estado.ERROR;
        };
    }

    static String fechaLocal(String fechaUTC) {
        try {
            return fechaLocal(Instant.parse(fechaUTC));
        } catch (DateTimeParseException ex) {
            return "—";
        }
    }

    static String fechaLocal(Instant instante) {
        return FECHA_LOCAL.format(instante);
    }

    static String abreviarEvento(String eventoId) {
        return eventoId.length() > 12 ? eventoId.substring(0, 8) + "…" + eventoId.substring(eventoId.length() - 4)
            : eventoId;
    }

    private PresentacionAvisos() {}
}
