package ec.edu.uta.monitor;

import static ec.edu.uta.monitor.TestSupport.linea;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.BufferedReader;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import ec.edu.uta.monitor.client.SondaHttpClient;
import ec.edu.uta.monitor.client.SondaHttpClient.ResultadoSonda;
import ec.edu.uta.monitor.config.MonitorProperties.Destino;
import ec.edu.uta.monitor.controller.MonitorController;
import ec.edu.uta.monitor.exception.MonitorExceptionHandler;
import ec.edu.uta.monitor.logs.AccessLogParser;
import ec.edu.uta.monitor.logs.AccessLogReader;
import ec.edu.uta.monitor.model.TipoDestino;
import ec.edu.uta.monitor.service.AlertaService;
import ec.edu.uta.monitor.service.ClasificadorSalud;
import ec.edu.uta.monitor.service.EstadoService;
import ec.edu.uta.monitor.service.MetricasService;
import ec.edu.uta.monitor.service.SondeoService;

class MonitorApe04Test {
    @TempDir Path directorio;
    private static final String A = "127.0.0.1:8080";
    private static final String B = "127.0.0.1:8082";
    private static final String RUTA = "/api/vehiculos";
    private static final String MONITOR = "/api/monitor";

    @Test void leeFormatoRealYConciliaFallbackSinMezclarElRestoDeRutas() throws Exception {
        Path log = directorio.resolve("gateway.log");
        var entradas = List.of(
                linea("GET", RUTA, 200, A, "200", "0.012"),
                linea("GET", RUTA, 200, A + ", " + B, "504, 200", "0.010, 0.003"),
                linea("GET", RUTA, 502, A + ", " + B, "502, 502", "-, -"),
                linea("GET", RUTA, 502, "vehiculos", "502", "-"),
                linea("GET", "/nginx-ping", 200, "-", "-", "-"),
                linea("GET", "/nginx-ping", 200, "", "", ""),
                linea("GET", "/api/ventas", 200, "127.0.0.1:8002", "200", "0.002"),
                linea("POST", RUTA, 201, A, "201", "0.003"),
                "JSON dañado");
        Files.write(log, entradas);
        var props = TestSupport.props(log.toString());
        var servicio = new MetricasService(props, new AccessLogReader(props, new AccessLogParser()));
        var datos = servicio.agregar();
        assertThat(datos.balanceo().totalSolicitudes()).isEqualTo(4);
        assertThat(datos.balanceo().instancias()).extracting(i -> i.solicitudes()).containsExactly(1L, 1L);
        assertThat(datos.balanceo().sinUpstream().solicitudes()).isEqualTo(2);
        assertThat(datos.balanceo().patronesReintento()).containsEntry("A:504 -> B:200", 1L);
        assertThat(datos.balanceo().conciliacion().cuadra()).isTrue();
        assertThat(datos.balanceo().inicioVentana()).isNull();
        assertThat(datos.estadisticas().respuestas2xx()).isEqualTo(2);
        assertThat(datos.estadisticas().integridad().excluidasPorRuta()).isEqualTo(4);
        assertThat(datos.estadisticas().integridad().lineasInvalidas()).isEqualTo(1);
        assertThat(Files.readAllLines(log)).isEqualTo(entradas);
    }

    @Test void exponeCincoRutasYAlertaSoloAnteCambiosRealesPorServicio() throws Exception {
        Path log = Files.writeString(directorio.resolve("gateway.log"), linea("GET", RUTA, 200, A, "200", "0.001"));
        var props = TestSupport.props(log.toString());
        var estados = new EstadoService(props);
        var alertas = new AlertaService(props);
        var mvc = MockMvcBuilders.standaloneSetup(new MonitorController(props, estados, alertas,
                        new MetricasService(props, new AccessLogReader(props, new AccessLogParser()))))
                .setControllerAdvice(new MonitorExceptionHandler()).build();
        mvc.perform(get(MONITOR + "/estado")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.fastapi.estado").value("DESCONOCIDO"));
        mvc.perform(get(MONITOR + "/instancias")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.nginx.estado").value("DESCONOCIDO"));

        var sonda = mock(SondaHttpClient.class);
        var javaBDisponible = new AtomicBoolean(true);
        var fastApiDisponible = new AtomicBoolean(false);
        when(sonda.sondear(any())).thenAnswer(invocacion -> {
            Destino destino = invocacion.getArgument(0);
            if (destino.id().equals("api-b") && !javaBDisponible.get()) {
                return new ResultadoSonda(null, null, null, "Timeout de lectura");
            }
            if (destino.tipo() == TipoDestino.FASTAPI && !fastApiDisponible.get()) {
                return new ResultadoSonda(503, 1L, "{\"status\":\"DOWN\"}", null);
            }
            return new ResultadoSonda(200, 1L, destino.tipo() == TipoDestino.NGINX ? "pong\n" : "{\"status\":\"UP\"}", null);
        });

        var executor = Executors.newFixedThreadPool(4);
        try {
            var sondeo = new SondeoService(props, sonda, new ClasificadorSalud(), estados, alertas, executor);
            sondeo.ejecutarRonda();
            mvc.perform(get(MONITOR + "/alertas")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalGeneradas").value(0));
            mvc.perform(get(MONITOR + "/estado")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.fastapi.estado").value("DOWN"))
                    .andExpect(jsonPath("$.estadoGeneral").value("NORMAL"));

            javaBDisponible.set(false);
            sondeo.ejecutarRonda();
            sondeo.ejecutarRonda();
            mvc.perform(get(MONITOR + "/instancias")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.nginx.estado").value("UP"))
                    .andExpect(jsonPath("$.instancias[0].estado").value("UP"))
                    .andExpect(jsonPath("$.instancias[1].estado").value("DOWN"));
            mvc.perform(get(MONITOR + "/estado")).andExpect(jsonPath("$.estadoGeneral").value("DEGRADADO"));
            assertThat(alertas.totalGeneradas()).isEqualTo(1);

            javaBDisponible.set(true);
            fastApiDisponible.set(true);
            sondeo.ejecutarRonda();
            mvc.perform(get(MONITOR + "/alertas")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalGeneradas").value(3));
            assertThat(alertas.ultimas()).allSatisfy(a -> assertThat(a.timestamp()).isNotNull());
            assertThat(alertas.ultimas()).anySatisfy(a -> {
                assertThat(a.componente()).contains("8082");
                assertThat(a.estadoAnterior()).isEqualTo("DOWN");
                assertThat(a.estadoNuevo()).isEqualTo("UP");
            });
        } finally {
            executor.shutdownNow();
        }
        mvc.perform(get(MONITOR + "/balanceo")).andExpect(status().isOk())
                .andExpect(jsonPath("$.instancias[0].solicitudes").value(1));
        mvc.perform(get(MONITOR + "/estadisticas")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalPeticiones").value(1));
        mvc.perform(get(MONITOR + "/balanceo").param("desde", "2026-11-20T00:00:00Z"))
                .andExpect(status().isBadRequest());
    }

    @Test void distingueArchivoAusenteInaccesibleInvalidoYVacio() throws Exception {
        Path log = directorio.resolve("gateway.log");
        var props = TestSupport.props(log.toString());
        var parser = new AccessLogParser();
        var estados = new EstadoService(props);
        var alertas = new AlertaService(props);
        var mvc = MockMvcBuilders.standaloneSetup(new MonitorController(props, estados, alertas,
                        new MetricasService(props, new AccessLogReader(props, parser))))
                .setControllerAdvice(new MonitorExceptionHandler()).build();
        mvc.perform(get(MONITOR + "/balanceo")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.diagnostico.estado").value("ARCHIVO_INEXISTENTE"));
        Files.writeString(log, "JSON dañado");
        mvc.perform(get(MONITOR + "/estadisticas")).andExpect(status().is(422));
        Files.writeString(log, "");
        mvc.perform(get(MONITOR + "/estadisticas")).andExpect(status().isOk())
                .andExpect(jsonPath("$.integridad.estado").value("LOG_VACIO"));
        var lector = new AccessLogReader(props, parser) {
            @Override protected BufferedReader abrir(Path ruta) throws AccessDeniedException {
                throw new AccessDeniedException(ruta.toString());
            }
        };
        var sinPermiso = MockMvcBuilders.standaloneSetup(new MonitorController(props, estados, alertas,
                        new MetricasService(props, lector))).setControllerAdvice(new MonitorExceptionHandler()).build();
        sinPermiso.perform(get(MONITOR + "/estadisticas")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.diagnostico.estado").value("ARCHIVO_INACCESIBLE"));
    }

}
