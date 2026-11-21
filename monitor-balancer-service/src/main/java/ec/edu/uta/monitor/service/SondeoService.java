package ec.edu.uta.monitor.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import ec.edu.uta.monitor.client.SondaHttpClient;
import ec.edu.uta.monitor.client.SondaHttpClient.ResultadoSonda;
import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.config.MonitorProperties.Destino;
import ec.edu.uta.monitor.model.EstadoComponente;
import ec.edu.uta.monitor.model.EstadoGeneral;
import ec.edu.uta.monitor.model.Verificacion;
import ec.edu.uta.monitor.service.ClasificadorSalud.Clasificacion;

/**
 * Sondeo ACTIVO y periódico (por defecto cada 5 s). En cada ronda consulta en
 * paralelo NGINX (/nginx-ping) y las dos instancias (/actuator/health), registra
 * fecha/hora, destino, estado y latencia, calcula el estado general y genera
 * alertas solo cuando hay transiciones. Únicamente OBSERVA: no toca NGINX ni
 * reinicia procesos.
 */
@Service
public class SondeoService {

    private static final Logger LOG = LoggerFactory.getLogger(SondeoService.class);

    private final MonitorProperties props;
    private final SondaHttpClient sonda;
    private final ClasificadorSalud clasificador;
    private final EstadoService estados;
    private final AlertaService alertas;
    private final ExecutorService executor;
    private final AtomicLong rondas = new AtomicLong();

    public SondeoService(MonitorProperties props, SondaHttpClient sonda, ClasificadorSalud clasificador,
                         EstadoService estados, AlertaService alertas, ExecutorService sondaExecutor) {
        this.props = props;
        this.sonda = sonda;
        this.clasificador = clasificador;
        this.estados = estados;
        this.alertas = alertas;
        this.executor = sondaExecutor;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void mostrarCatalogo() {
        LOG.info("Catálogo de sondeo (cada {} ms, timeout conexión {} ms / lectura {} ms):",
                props.intervaloMs(), props.timeoutConexionMs(), props.timeoutLecturaMs());
        props.destinos().forEach(d -> LOG.info("  - {} [{}] {}", d.nombre(), d.tipo(), d.url()));
        LOG.info("Log de NGINX: {}", props.logs().ruta());
    }

    /** fixedDelay: la siguiente ronda empieza 5 s DESPUÉS de terminar la anterior (nunca se solapan). */
    @Scheduled(initialDelay = 1000, fixedDelayString = "${monitor.intervalo-ms:5000}")
    public void ejecutarRonda() {
        List<CompletableFuture<Verificacion>> futuros = new ArrayList<>();
        for (Destino d : props.destinos()) {
            futuros.add(CompletableFuture.supplyAsync(() -> verificar(d), executor)
                    // Red de seguridad adicional a los timeouts del cliente HTTP
                    .completeOnTimeout(sinRespuesta(d, "Timeout global de la sonda"),
                            props.timeoutConexionMs() + props.timeoutLecturaMs() + 1000L, TimeUnit.MILLISECONDS));
        }
        List<Verificacion> resultados = futuros.stream().map(CompletableFuture::join).toList();
        // Una sola marca de tiempo por ronda: la usan "ultimaRevision" y todas las alertas de la ronda
        Instant revision = Instant.now();

        Verificacion nginx = resultados.stream()
                .filter(v -> v.tipo() == ec.edu.uta.monitor.model.TipoDestino.NGINX).findFirst().orElseThrow();
        List<Verificacion> backends = resultados.stream()
                .filter(v -> v.tipo() == ec.edu.uta.monitor.model.TipoDestino.BACKEND).toList();
        EstadoGeneral general = EstadoGeneral.calcular(nginx.estado(),
                backends.stream().map(Verificacion::estado).toList());

        Verificacion fastapi = resultados.stream()
                .filter(v -> v.tipo() == ec.edu.uta.monitor.model.TipoDestino.FASTAPI).findFirst().orElseThrow();
        EstadoService.Ronda ronda = new EstadoService.Ronda(rondas.incrementAndGet(), revision, nginx, backends, fastapi, general);
        estados.publicar(ronda);

        // Solo transiciones de disponibilidad observadas por componente.
        for (Verificacion v : resultados) {
            alertas.registrarSiCambia(etiqueta(v), v.estado().name(), v.detalle(), revision);
        }

        LOG.info("Ronda {} | {} | general={}", ronda.numero(),
                resultados.stream().map(v -> etiqueta(v) + "=" + v.estado()
                        + (v.latenciaMs() == null ? " (-)" : " (" + v.latenciaMs() + " ms)"))
                        .collect(Collectors.joining(" | ")),
                general);
    }

    private Verificacion verificar(Destino d) {
        ResultadoSonda r = sonda.sondear(d);
        Clasificacion c = clasificador.clasificar(d.tipo(), r);
        return new Verificacion(d.id(), d.nombre(), d.tipo(), d.url(), d.puerto(), c.estado(),
                r.codigoHttp(), r.latenciaMs(), Instant.now(), c.detalle());
    }

    private Verificacion sinRespuesta(Destino d, String detalle) {
        return new Verificacion(d.id(), d.nombre(), d.tipo(), d.url(), d.puerto(), EstadoComponente.DOWN,
                null, null, Instant.now(), detalle);
    }

    static String etiqueta(Verificacion v) {
        return v.nombre() + " (" + v.puerto() + ")";
    }
}
