package ec.edu.uta.monitor.config;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Cliente HTTP de las sondas con timeouts FINITOS de conexión y de lectura.
 * Así una instancia colgada o apagada nunca bloquea indefinidamente al monitor.
 */
@Configuration
public class HttpClientConfig {

    @Bean
    public RestClient sondaRestClient(MonitorProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection connection, String method) throws IOException {
                super.prepareConnection(connection, method);
                connection.setInstanceFollowRedirects(false);
            }
        };
        factory.setConnectTimeout(props.timeoutConexionMs());
        factory.setReadTimeout(props.timeoutLecturaMs());
        return RestClient.builder()
                .requestFactory(factory)
                .defaultHeader("User-Agent", "monitor-balancer-service/1.0")
                .build();
    }

    /** Hilos dedicados para sondear los destinos en paralelo (una ronda dura como máximo un timeout). */
    @Bean(destroyMethod = "shutdownNow")
    public ExecutorService sondaExecutor(MonitorProperties props) {
        AtomicInteger n = new AtomicInteger();
        return Executors.newFixedThreadPool(Math.max(1, props.destinos().size()), r -> {
            Thread t = new Thread(r, "sonda-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
    }
}
