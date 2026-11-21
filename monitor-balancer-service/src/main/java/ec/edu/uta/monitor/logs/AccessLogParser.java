package ec.edu.uta.monitor.logs;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import ec.edu.uta.monitor.model.RegistroAcceso;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** Analiza una entrada JSON del formato gateway de APE 04. */
@Component
public class AccessLogParser {

    private final JsonMapper mapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();

    public Optional<RegistroAcceso> parsear(String linea) {
        if (linea == null || linea.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode n = mapper.readTree(linea);
            if (n == null || !n.isObject()) return Optional.empty();
            String metodo = campo(n, "method");
            String uri = campo(n, "uri");
            if (!metodo.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]+")
                    || !uri.startsWith("/") || uri.chars().anyMatch(Character::isISOControl)) return Optional.empty();
            JsonNode codigo = n.get("status");
            if (codigo == null || !codigo.isIntegralNumber() || !codigo.canConvertToInt()) return Optional.empty();
            int estado = codigo.asInt();
            if (estado < 100 || estado > 599) return Optional.empty();
            List<String> addrs = lista(campoUpstream(n, "upstream_addr"));
            List<String> estados = intentos(campoUpstream(n, "upstream_status"), addrs.size());
            List<String> respuesta = intentos(campoUpstream(n, "upstream_response_time"), addrs.size());
            for (String addr : addrs) {
                if (addr.isBlank() || addr.chars().anyMatch(Character::isWhitespace)) return Optional.empty();
            }
            for (String s : estados) {
                if (!"-".equals(s)) {
                    int estadoIntento = Integer.parseInt(s);
                    if (estadoIntento < 100 || estadoIntento > 599) return Optional.empty();
                }
            }
            for (String t : respuesta) if (!"-".equals(t)) numero(t);
            return Optional.of(new RegistroAcceso(
                    metodo, uri, estado, addrs, estados, respuesta,
                    numero(campo(n, "request_time"))));
        } catch (RuntimeException e) {
            return Optional.empty();          // línea corrupta o de otro formato: se cuenta como inválida
        }
    }

    private static String campoUpstream(JsonNode n, String nombre) {
        JsonNode valor = n.get(nombre);
        if (valor == null || !valor.isString()) throw new IllegalArgumentException("Campo upstream inválido");
        return valor.asString();
    }

    private static String campo(JsonNode n, String nombre) {
        JsonNode valor = n.get(nombre);
        if (valor == null || !valor.isString() || valor.asString().isBlank()) {
            throw new IllegalArgumentException("Campo obligatorio inválido");
        }
        return valor.asString();
    }

    /** Conserva los guiones por intento; '-' completo sin upstream equivale a lista vacía. */
    private static List<String> intentos(String valor, int cantidad) {
        if (cantidad == 0 && (valor.isEmpty() || "-".equals(valor))) return List.of();
        List<String> elementos = new ArrayList<>();
        for (String grupo : valor.split(" : ", -1)) {
            for (String parte : grupo.split(",", -1)) elementos.add(parte.trim());
        }
        if (elementos.size() != cantidad || elementos.stream().anyMatch(String::isEmpty)) {
            throw new IllegalArgumentException("Intentos upstream incompatibles");
        }
        return List.copyOf(elementos);
    }

    /**
     * NGINX separa intentos con ", " y grupos de redirección interna con " : ".
     * "-" o vacío = no hubo upstream.
     */
    static List<String> lista(String valor) {
        List<String> r = new ArrayList<>();
        if (valor == null || valor.isBlank() || "-".equals(valor.trim())) {
            return r;
        }
        for (String grupo : valor.split(" : ", -1)) {
            for (String p : grupo.split(",", -1)) {
                String t = p.trim();
                if (t.isEmpty()) throw new IllegalArgumentException("Dirección upstream vacía");
                r.add(t);
            }
        }
        return r;
    }

    private static double numero(String v) {
        double numero = new BigDecimal(v).doubleValue();
        if (!Double.isFinite(numero) || !Double.isFinite(numero * 1000) || numero < 0) {
            throw new IllegalArgumentException("Tiempo inválido");
        }
        return numero;
    }
}
