package ec.edu.uta.monitor.client;

import java.io.InputStream;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.config.MonitorProperties.Destino;

/**
 * Componente técnico: ejecuta UNA petición GET de sondeo, mide la latencia y
 * devuelve el resultado crudo (código HTTP, cuerpo corto o tipo de error).
 * No decide el estado: eso lo hace la capa de servicio.
 */
@Component
public class SondaHttpClient {

    private static final int MAX_CUERPO = 512;   // solo se guarda lo necesario para leer "status"

    private final RestClient cliente;
    private final MonitorProperties props;

    public SondaHttpClient(RestClient sondaRestClient, MonitorProperties props) {
        this.cliente = sondaRestClient;
        this.props = props;
    }

    /** Resultado crudo de una sonda. codigoHttp/latenciaMs son null si no hubo respuesta HTTP. */
    public record ResultadoSonda(Integer codigoHttp, Long latenciaMs, String cuerpo, String error) {
        public boolean respondio() {
            return codigoHttp != null;
        }
    }

    public ResultadoSonda sondear(Destino destino) {
        long inicio = System.nanoTime();
        try {
            return cliente.get()
                    .uri(destino.url())
                    .exchange((request, response) -> {
                        int codigo = response.getStatusCode().value();
                        String cuerpo;
                        try (InputStream in = response.getBody()) {
                            cuerpo = new String(in.readNBytes(MAX_CUERPO), StandardCharsets.UTF_8);
                        }
                        long ms = (System.nanoTime() - inicio) / 1_000_000;
                        return new ResultadoSonda(codigo, ms, cuerpo, null);
                    });
        } catch (Exception ex) {
            return new ResultadoSonda(null, null, null, describir(ex));
        }
    }

    /** Traduce la causa raíz a un mensaje legible (sin datos sensibles). */
    private String describir(Throwable ex) {
        Throwable c = ex;
        while (c.getCause() != null && c.getCause() != c) {
            if (c instanceof HttpConnectTimeoutException || c instanceof HttpTimeoutException || c instanceof SocketTimeoutException
                    || c instanceof ConnectException) {
                break;
            }
            c = c.getCause();
        }
        if (c instanceof HttpConnectTimeoutException) {
            return "Timeout de conexión (" + props.timeoutConexionMs() + " ms)";
        }
        if (c instanceof HttpTimeoutException) {
            return "Timeout de lectura (" + props.timeoutLecturaMs() + " ms)";
        }
        if (c instanceof SocketTimeoutException) {
            return "Timeout de conexión o lectura";
        }
        if (c instanceof ConnectException) {
            return "Conexión rechazada (el proceso no escucha en el puerto)";
        }
        return "Sin respuesta: " + c.getClass().getSimpleName();
    }
}
