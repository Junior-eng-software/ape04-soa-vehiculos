package ec.edu.com;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;


public final class VehiculosApiClient{

    private static final String URL_API = "http://127.0.0.1:8080/api/vehiculos";
    private final HttpClient clienteHttp;
    private final URI endpoint;
    private final ObjectMapper mapper = new ObjectMapper();

    public VehiculosApiClient() {
        this(nuevoTransporte());
    }

    VehiculosApiClient(HttpClient clienteHttp) {
        this(clienteHttp, URI.create(URL_API));
    }

    VehiculosApiClient(HttpClient clienteHttp, URI endpoint) {
        this.clienteHttp = clienteHttp;
        this.endpoint = endpoint;
    }

    static HttpClient nuevoTransporte() {
        return HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    }

    public CompletableFuture<ResultadoConsulta> consultarVehiculos(String jwt) {
        HttpRequest solicitud = HttpRequest.newBuilder(endpoint)
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer " + jwt)
            .GET()
            .build();
        var envio = clienteHttp.sendAsync(solicitud, HttpResponse.BodyHandlers.ofString());
        var resultado = envio.thenApply(respuesta -> {
            int codigo = respuesta.statusCode();
            if (codigo != 200) {
                return new ResultadoConsulta(codigo, List.of());
            }
            try {
                List<Vehiculo> vehiculos = mapper.readValue(respuesta.body(), new TypeReference<>() {});
                return new ResultadoConsulta(codigo, vehiculos);
            } catch (JsonProcessingException error) {
                throw new CompletionException(error);
            }
        });
        resultado.whenComplete((valor, error) -> {
            if (resultado.isCancelled()) {
                envio.cancel(true);
            }
        });
        return resultado;
    }

    public record ResultadoConsulta(int codigoHttp, List<Vehiculo> vehiculos) {}
}
