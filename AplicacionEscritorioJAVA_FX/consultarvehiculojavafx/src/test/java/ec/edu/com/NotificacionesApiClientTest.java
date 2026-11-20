package ec.edu.com;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class NotificacionesApiClientTest {
    private static final String RUTA = "/api/notificaciones";
    private HttpServer servidor;

    @BeforeEach
    void iniciar() throws IOException {
        servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servidor.start();
    }

    @AfterEach
    void detener() {
        servidor.stop(0);
    }

    @Test
    void enviaSoloBearerYDeserializaUnAviso() throws Exception {
        var cabeceras = new AtomicReference<List<String>>();
        servidor.createContext(RUTA, peticion -> {
            cabeceras.set(java.util.Arrays.asList(peticion.getRequestMethod(),
                peticion.getRequestHeaders().getFirst("Authorization"),
                peticion.getRequestHeaders().getFirst("X-Notification-Key")));
            responder(peticion, 200, "[" + aviso("evento-prueba", 18) + "]");
        });
        var resultado = cliente().consultar("token-de-prueba").get(5, TimeUnit.SECONDS);
        assertEquals(200, resultado.codigoHttp());
        assertEquals(List.of(new AvisoVenta("evento-prueba", 18, "2026-11-20T05:56:52Z", "CONFIRMADA")),
            resultado.avisos());
        assertEquals(java.util.Arrays.asList("GET", "Bearer token-de-prueba", null), cabeceras.get());
    }

    @Test
    void deduplicaSinAlterarElOrdenDelServidor() throws Exception {
        servidor.createContext(RUTA, peticion -> responder(peticion, 200,
            "[" + aviso("a", 20) + "," + aviso("b", 19) + "," + aviso("a", 21) + "]"));
        var resultado = cliente().consultar("prueba").get(5, TimeUnit.SECONDS);
        assertEquals(List.of("a", "b"), resultado.avisos().stream().map(AvisoVenta::eventoId).toList());
        assertEquals(List.of(20, 19), resultado.avisos().stream().map(AvisoVenta::ventaId).toList());
    }

    @Test
    void historialVacio() throws Exception {
        servidor.createContext(RUTA, peticion -> responder(peticion, 200, "[]"));
        var resultado = cliente().consultar("prueba").get(5, TimeUnit.SECONDS);
        assertEquals(200, resultado.codigoHttp());
        assertTrue(resultado.avisos().isEmpty());
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 503, 418})
    void conservaCodigoHttpSinInterpretarElCuerpo(int codigo) throws Exception {
        servidor.createContext(RUTA, peticion -> responder(peticion, codigo, "error"));
        var resultado = cliente().consultar("prueba").get(5, TimeUnit.SECONDS);
        assertEquals(codigo, resultado.codigoHttp());
        assertTrue(resultado.avisos().isEmpty());
    }

    @Test
    void respuestaInesperadaFallaSinProducirFilas() {
        servidor.createContext(RUTA, peticion -> responder(peticion, 200, "{}"));
        assertThrows(ExecutionException.class, () -> cliente().consultar("prueba").get(5, TimeUnit.SECONDS));
    }

    @Test
    void errorDeRedCompletaLaConsultaConError() {
        var cliente = cliente();
        servidor.stop(0);
        var error = assertThrows(ExecutionException.class,
            () -> cliente.consultar("prueba").get(5, TimeUnit.SECONDS));
        assertInstanceOf(IOException.class, error.getCause());
    }

    @Test
    void timeoutSinBloquearAlLlamante() {
        CountDownLatch liberar = new CountDownLatch(1);
        servidor.createContext(RUTA, peticion -> {
            try (peticion) {
                liberar.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        });
        try {
            var cliente = new NotificacionesApiClient(VehiculosApiClient.nuevoTransporte(),
                endpoint(RUTA), Duration.ofMillis(500));
            var error = assertThrows(ExecutionException.class,
                () -> cliente.consultar("prueba").get(3, TimeUnit.SECONDS));
            assertTrue(error.getCause() instanceof HttpTimeoutException || error.getCause() instanceof TimeoutException);
        } finally {
            liberar.countDown();
        }
    }

    @Test
    void clienteDeVehiculosConservaSuConsulta() throws Exception {
        var autorizacion = new AtomicReference<String>();
        servidor.createContext("/api/vehiculos", peticion -> {
            autorizacion.set(peticion.getRequestHeaders().getFirst("Authorization"));
            responder(peticion, 200, """
                [{"idVehiculo":5,"marca":"Marca","modelo":"Modelo","placa":"PRUEBA","chasis":"PRUEBA",
                  "anio":2021,"color":"Azul","precio":1234.50,"estado":"DISPONIBLE"}]
                """);
        });
        var cliente = new VehiculosApiClient(VehiculosApiClient.nuevoTransporte(), endpoint("/api/vehiculos"));
        var resultado = cliente.consultarVehiculos("prueba").get(5, TimeUnit.SECONDS);
        assertEquals("Bearer prueba", autorizacion.get());
        assertEquals(200, resultado.codigoHttp());
        assertEquals(1, resultado.vehiculos().size());
        assertEquals(5, resultado.vehiculos().get(0).idVehiculo());
    }

    private NotificacionesApiClient cliente() {
        return new NotificacionesApiClient(VehiculosApiClient.nuevoTransporte(), endpoint(RUTA), Duration.ofSeconds(3));
    }

    private URI endpoint(String ruta) {
        return URI.create("http://127.0.0.1:" + servidor.getAddress().getPort() + ruta);
    }

    private static String aviso(String id, int venta) {
        return """
            {"eventoId":"%s","ventaId":%d,"fechaUTC":"2026-11-20T05:56:52Z","estado":"CONFIRMADA"}
            """.formatted(id, venta);
    }

    private static void responder(HttpExchange peticion, int codigo, String cuerpo) throws IOException {
        try (peticion) {
            byte[] bytes = cuerpo.getBytes(StandardCharsets.UTF_8);
            peticion.getResponseHeaders().set("Content-Type", "application/json");
            peticion.sendResponseHeaders(codigo, bytes.length);
            peticion.getResponseBody().write(bytes);
        }
    }
}
