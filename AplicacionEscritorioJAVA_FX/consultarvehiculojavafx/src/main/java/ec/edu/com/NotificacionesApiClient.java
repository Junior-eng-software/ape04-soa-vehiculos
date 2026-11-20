package ec.edu.com;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

final class NotificacionesApiClient {
    private final HttpClient http;
    private final URI endpoint;
    private final Duration timeout;
    private final ObjectMapper mapper = new ObjectMapper();

    NotificacionesApiClient(HttpClient http) {
        this(http, URI.create("http://127.0.0.1:8090/api/notificaciones"), Duration.ofSeconds(6));
    }

    NotificacionesApiClient(HttpClient http, URI endpoint, Duration timeout) {
        this.http = http;
        this.endpoint = endpoint;
        this.timeout = timeout;
    }

    CompletableFuture<Resultado> consultar(String jwt) {
        var solicitud = HttpRequest.newBuilder(endpoint)
            .timeout(timeout)
            .header("Authorization", "Bearer " + jwt)
            .header("Accept", "application/json")
            .GET()
            .build();
        var envio = http.sendAsync(solicitud, HttpResponse.BodyHandlers.ofString());
        var resultado = envio.thenApply(this::interpretar).orTimeout(timeout.toMillis(), TimeUnit.MILLISECONDS);
        resultado.whenComplete((valor, error) -> {
            if (resultado.isCancelled() || error instanceof TimeoutException) {
                envio.cancel(true);
            }
        });
        return resultado;
    }

    private Resultado interpretar(HttpResponse<String> respuesta) {
        int codigo = respuesta.statusCode();
        if (codigo != 200) {
            return new Resultado(codigo, List.of());
        }
        try {
            List<AvisoVenta> avisos = mapper.readValue(respuesta.body(), new TypeReference<>() {});
            if (avisos == null) {
                throw new IllegalArgumentException("Se esperaba una lista de avisos");
            }
            var unicos = new LinkedHashMap<String, AvisoVenta>();
            for (AvisoVenta aviso : avisos) {
                if (aviso == null || aviso.eventoId() == null || aviso.eventoId().isBlank()
                        || aviso.ventaId() <= 0 || aviso.fechaUTC() == null || aviso.estado() == null) {
                    throw new IllegalArgumentException("Aviso incompleto");
                }
                unicos.putIfAbsent(aviso.eventoId(), aviso);
            }
            return new Resultado(codigo, List.copyOf(unicos.values()));
        } catch (JsonProcessingException error) {
            throw new CompletionException(error);
        }
    }

    record Resultado(int codigoHttp, List<AvisoVenta> avisos) {}
}
