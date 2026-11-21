package ec.edu.uta.monitor.controller;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.config.MonitorProperties.Destino;
import ec.edu.uta.monitor.dto.AlertasResponse;
import ec.edu.uta.monitor.dto.AlertasResponse.AlertaDto;
import ec.edu.uta.monitor.dto.BalanceoResponse;
import ec.edu.uta.monitor.dto.EstadisticasResponse;
import ec.edu.uta.monitor.dto.EstadoResponse;
import ec.edu.uta.monitor.dto.EstadoResponse.InstanciaResumen;
import ec.edu.uta.monitor.dto.InstanciasResponse;
import ec.edu.uta.monitor.dto.InstanciasResponse.InstanciaDetalle;
import ec.edu.uta.monitor.dto.InstanciasResponse.VerificacionDto;
import ec.edu.uta.monitor.model.EstadoComponente;
import ec.edu.uta.monitor.model.EstadoGeneral;
import ec.edu.uta.monitor.model.Verificacion;
import ec.edu.uta.monitor.service.AlertaService;
import ec.edu.uta.monitor.service.EstadoService;
import ec.edu.uta.monitor.service.EstadoService.Ronda;
import ec.edu.uta.monitor.service.EstadoService.Vista;
import ec.edu.uta.monitor.service.Fechas;
import ec.edu.uta.monitor.service.MetricasService;

/**
 * Cinco endpoints GET del monitor. Responden SIEMPRE desde las observaciones en
 * memoria (no llaman a los backends en la petición), por eso siguen funcionando
 * aunque NGINX o las instancias estén caídos.
 */
@RestController
@RequestMapping(value = "/api/monitor", produces = MediaType.APPLICATION_JSON_VALUE)
public class MonitorController {

    private final MonitorProperties props;
    private final EstadoService estados;
    private final AlertaService alertas;
    private final MetricasService metricas;

    public MonitorController(MonitorProperties props, EstadoService estados, AlertaService alertas,
                             MetricasService metricas) {
        this.props = props;
        this.estados = estados;
        this.alertas = alertas;
        this.metricas = metricas;
    }

    /** Estado global: NGINX, estado general y resumen de A/B. */
    @GetMapping("/estado")
    public ResponseEntity<EstadoResponse> estado() {
        ZoneId z = props.zona();
        Ronda r = estados.ultimaRonda();
        if (r == null) {   // el monitor acaba de arrancar: aún no hay observaciones reales
            List<InstanciaResumen> vacias = props.backends().stream()
                    .map(d -> new InstanciaResumen(d.nombre(), d.puerto(), EstadoComponente.DESCONOCIDO.name(), null))
                    .toList();
            return ResponseEntity.status(503).body(new EstadoResponse(Fechas.seg(Instant.now(), z), null, 0,
                    EstadoComponente.DESCONOCIDO.name(), null, EstadoGeneral.SIN_DATOS.name(),
                    "Sin rondas de verificación todavía", vacias, inicial(props.fastapi())));
        }
        List<InstanciaResumen> inst = r.backends().stream()
                .map(v -> new InstanciaResumen(v.nombre(), v.puerto(), v.estado().name(), v.latenciaMs()))
                .toList();
        String resumen = r.backendsUp() + " de " + r.backends().size() + " backends UP; NGINX " + r.nginx().estado();
        return ResponseEntity.ok(new EstadoResponse(Fechas.seg(Instant.now(), z), Fechas.seg(r.fecha(), z),
                r.numero(), r.nginx().estado().name(), r.nginx().latenciaMs(), r.estadoGeneral().name(),
                resumen, inst, resumen(r.fastapi())));
    }

    /** Detalle por destino: puerto, URL consultada, estado, latencia y última revisión. */
    @GetMapping("/instancias")
    public ResponseEntity<InstanciasResponse> instancias() {
        Vista vista = estados.vista();
        Ronda r = vista.ronda();
        InstanciaDetalle nginx = detalle(props.nginx(), r == null ? null : r.nginx(), vista);
        List<InstanciaDetalle> backs = props.backends().stream()
                .map(d -> detalle(d, r == null ? null
                        : r.backends().stream().filter(v -> v.destinoId().equals(d.id())).findFirst().orElse(null), vista))
                .toList();
        InstanciasResponse body = new InstanciasResponse(r == null ? null : Fechas.seg(r.fecha(), props.zona()),
                props.intervaloMs(), props.timeoutConexionMs(), props.timeoutLecturaMs(), nginx, backs,
                detalle(props.fastapi(), r == null ? null : r.fastapi(), vista));
        return ResponseEntity.status(r == null ? 503 : 200).body(body);
    }

    /** Distribución real del balanceo acumulada (el log no tiene fechas por solicitud). */
    @GetMapping("/balanceo")
    public BalanceoResponse balanceo(@RequestParam(required = false) String desde,
                                     @RequestParam(required = false) String hasta) {
        metricas.validarAlcance(desde, hasta);
        return metricas.balanceo();
    }

    /** Totales, 2xx/4xx/5xx y tiempos medios del acumulado. */
    @GetMapping("/estadisticas")
    public EstadisticasResponse estadisticas(@RequestParam(required = false) String desde,
                                             @RequestParam(required = false) String hasta) {
        metricas.validarAlcance(desde, hasta);
        return metricas.estadisticas();
    }

    /** Últimos eventos de transición (máximo configurable, por defecto 20). */
    @GetMapping("/alertas")
    public AlertasResponse alertas() {
        ZoneId z = props.zona();
        List<AlertaDto> lista = alertas.ultimas().stream()
                .map(a -> new AlertaDto(a.id(), Fechas.seg(a.timestamp(), z), a.componente(), a.estadoAnterior(),
                        a.estadoNuevo(), a.estadoAnterior() + "→" + a.estadoNuevo(), a.severidad().name(),
                        a.mensaje()))
                .toList();
        return new AlertasResponse(alertas.maximo(), alertas.totalGeneradas(), lista.size(),
                "Historial en memoria: se pierde al reiniciar el monitor. Rondas sin cambios no generan alertas.",
                lista);
    }

    private InstanciaResumen inicial(Destino d) {
        return new InstanciaResumen(d.nombre(), d.puerto(), EstadoComponente.DESCONOCIDO.name(), null);
    }

    private InstanciaResumen resumen(Verificacion v) {
        return new InstanciaResumen(v.nombre(), v.puerto(), v.estado().name(), v.latenciaMs());
    }

    private InstanciaDetalle detalle(Destino d, Verificacion v, Vista vista) {
        ZoneId z = props.zona();
        List<VerificacionDto> hist = vista.historial(d.id()).stream()
                .map(h -> new VerificacionDto(Fechas.seg(h.fecha(), z), h.estado().name(), h.codigoHttp(), h.latenciaMs()))
                .toList();
        if (v == null) {
            return new InstanciaDetalle(d.nombre(), d.tipo().name(), d.puerto(), d.url(),
                    EstadoComponente.DESCONOCIDO.name(), null, null, null, "Sin observaciones todavía", hist);
        }
        return new InstanciaDetalle(d.nombre(), d.tipo().name(), d.puerto(), d.url(), v.estado().name(),
                v.codigoHttp(), v.latenciaMs(), Fechas.seg(v.fecha(), z), v.detalle(), hist);
    }
}
