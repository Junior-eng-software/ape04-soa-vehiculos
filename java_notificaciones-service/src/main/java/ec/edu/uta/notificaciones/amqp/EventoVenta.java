package ec.edu.uta.notificaciones.amqp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectReader;
import org.springframework.amqp.core.Message;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Set;
import java.util.regex.Pattern;

record EventoVenta(String eventoId, String tipo, int ventaId, int vehiculoId, LocalDateTime fechaUtc) {
    private static final Set<String> CAMPOS = Set.of("eventoId", "tipo", "ventaId", "vehiculoId", "fechaUTC");
    private static final Pattern UUID = Pattern.compile("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}");
    private static final Pattern UTC = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?Z");

    static EventoVenta leer(Message mensaje, ObjectReader lector) {
        if (mensaje.getBody().length > 1024
                || !"application/json".equals(mensaje.getMessageProperties().getContentType())) {
            throw new Invalido("FORMATO_INVALIDO");
        }
        JsonNode json;
        try {
            json = lector.readValue(mensaje.getBody());
        } catch (IOException e) {
            throw new Invalido("JSON_INVALIDO");
        }
        if (json == null || !json.isObject() || json.size() != CAMPOS.size() || !CAMPOS.stream().allMatch(json::has)) {
            throw new Invalido("CAMPOS_INVALIDOS");
        }

        String id = json.get("eventoId").textValue();
        String tipo = json.get("tipo").textValue();
        String fecha = json.get("fechaUTC").textValue();
        if (id == null || !UUID.matcher(id).matches() || !"VENTA_CONFIRMADA".equals(tipo)
                || !idValido(json.get("ventaId")) || !idValido(json.get("vehiculoId"))
                || fecha == null || !UTC.matcher(fecha).matches()) {
            throw new Invalido("VALORES_INVALIDOS");
        }
        try {
            LocalDateTime utc = LocalDateTime.parse(fecha.substring(0, fecha.length() - 1));
            if (utc.getYear() < 1000) {
                throw new Invalido("FECHA_INVALIDA");
            }
            return new EventoVenta(id, tipo, json.get("ventaId").intValue(), json.get("vehiculoId").intValue(), utc);
        } catch (DateTimeParseException e) {
            throw new Invalido("FECHA_INVALIDA");
        }
    }

    private static boolean idValido(JsonNode campo) {
        return campo.isIntegralNumber() && campo.canConvertToInt() && campo.intValue() > 0;
    }

    static final class Invalido extends RuntimeException {
        Invalido(String motivo) {
            super(motivo);
        }
    }
}
