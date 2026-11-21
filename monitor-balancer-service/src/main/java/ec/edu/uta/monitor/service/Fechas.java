package ec.edu.uta.monitor.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** Formato ISO-8601 con desplazamiento horario (p. ej. 2026-10-26T10:30:00-05:00). */
public final class Fechas {
    private static final DateTimeFormatter SEG = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");
    private static final DateTimeFormatter MS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");

    private Fechas() { }

    public static String seg(Instant i, ZoneId z) {
        return i == null ? null : SEG.format(i.atZone(z));
    }

    public static String ms(Instant i, ZoneId z) {
        return i == null ? null : MS.format(i.atZone(z));
    }
}
