package ec.edu.uta.notificaciones.security;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Component
public class IdentidadAdministrador {
    private static final Pattern BEARER = Pattern.compile("(?i:Bearer) ([A-Za-z0-9._~+/-]+=*)");
    private final URI identidad;
    private final RestClient cliente;

    public IdentidadAdministrador(@Value("${app.identidad-url}") URI identidad) {
        this.identidad = identidad;
        var http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        var fabrica = new JdkClientHttpRequestFactory(http);
        fabrica.setReadTimeout(Duration.ofSeconds(3));
        cliente = RestClient.builder().requestFactory(fabrica).build();
    }

    public void exigirAdmin(String autorizacion) {
        if (autorizacion == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        var bearer = BEARER.matcher(autorizacion);
        if (!bearer.matches()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        JsonNode perfil;
        try {
            perfil = cliente.get().uri(identidad)
                .headers(headers -> headers.setBearerAuth(bearer.group(1)))
                .accept(MediaType.APPLICATION_JSON)
                .exchange((peticion, respuesta) -> {
                    int estado = respuesta.getStatusCode().value();
                    return switch (estado) {
                        case 200 -> respuesta.bodyTo(JsonNode.class);
                        case 401 -> throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
                        case 403 -> throw new ResponseStatusException(HttpStatus.FORBIDDEN);
                        default -> throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
                    };
                });
        } catch (RestClientException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }

        if (perfil == null || !perfil.path("usuario").isTextual() || perfil.path("usuario").asText().isBlank()
                || !perfil.path("roles").isArray()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
        boolean admin = false;
        for (JsonNode rol : perfil.path("roles")) {
            if (!rol.isTextual()) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
            }
            admin |= "ROLE_ADMIN".equals(rol.textValue());
        }
        if (!admin) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }
}
