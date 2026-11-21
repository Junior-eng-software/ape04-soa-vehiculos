package ec.edu.uta.monitor.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.stereotype.Service;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.config.MonitorProperties.Destino;
import ec.edu.uta.monitor.dto.BalanceoResponse;
import ec.edu.uta.monitor.dto.BalanceoResponse.Conciliacion;
import ec.edu.uta.monitor.dto.BalanceoResponse.ConteoInstancia;
import ec.edu.uta.monitor.dto.BalanceoResponse.ConteoSimple;
import ec.edu.uta.monitor.dto.EstadisticasResponse;
import ec.edu.uta.monitor.dto.IntegridadLog;
import ec.edu.uta.monitor.exception.VentanaInvalidaException;
import ec.edu.uta.monitor.logs.AccessLogReader;
import ec.edu.uta.monitor.logs.AccessLogReader.Lectura;
import ec.edu.uta.monitor.model.RegistroAcceso;

/**
 * Distribución y tiempos acumulados en el access log actual de NGINX.
 */
@Service
public class MetricasService {

    private final MonitorProperties props;
    private final AccessLogReader reader;

    public MetricasService(MonitorProperties props, AccessLogReader reader) {
        this.props = props;
        this.reader = reader;
    }

    /** Sin marcas temporales por entrada, no es posible delimitar ventanas. */
    public void validarAlcance(String desde, String hasta) {
        if (desde != null || hasta != null) {
            throw new VentanaInvalidaException("El log APE 04 no registra fechas por solicitud; solo admite datos acumulados");
        }
    }

    /** Ambos contratos se derivan de una sola lectura y del mismo recorrido de registros válidos. */
    public record Agregado(BalanceoResponse balanceo, EstadisticasResponse estadisticas) { }

    public BalanceoResponse balanceo() {
        return agregar().balanceo();
    }

    public EstadisticasResponse estadisticas() {
        return agregar().estadisticas();
    }

    public Agregado agregar() {
        Lectura l = reader.leer();
        List<Destino> backends = props.backends();
        long[] porBackend = new long[backends.size()];
        long sinUpstream = 0, otros = 0, conReintento = 0;
        Map<String, Long> patronesReintento = new TreeMap<>();
        long c2 = 0, c3 = 0, c4 = 0, c5 = 0;
        Map<String, Long> porCodigo = new TreeMap<>();
        Map<String, Long> porMetodo = new TreeMap<>();
        List<Double> tiempos = new ArrayList<>();
        BigDecimal sumaTiempos = BigDecimal.ZERO;
        BigDecimal sumaUp = BigDecimal.ZERO;
        long nUp = 0;

        for (RegistroAcceso r : l.registros()) {
            int s = r.estado();
            if (s >= 200 && s < 300) c2++;
            else if (s >= 300 && s < 400) c3++;
            else if (s >= 400 && s < 500) c4++;
            else if (s >= 500 && s < 600) c5++;
            porCodigo.merge(String.valueOf(s), 1L, Long::sum);
            porMetodo.merge(r.metodo(), 1L, Long::sum);
            tiempos.add(r.requestTimeSeg() * 1000.0);
            sumaTiempos = sumaTiempos.add(BigDecimal.valueOf(r.requestTimeSeg()).movePointRight(3));
            Double up = r.upstreamResponseFinalSeg();
            if (up != null && r.respuestaFinalAtribuible()) {
                sumaUp = sumaUp.add(BigDecimal.valueOf(up).movePointRight(3));
                nUp++;
            }
            if (r.intentos() > 1) {
                conReintento++;
                List<String> intentos = new ArrayList<>();
                for (int i = 0; i < r.intentos(); i++) {
                    int destino = indice(backends, r.upstreamAddrs().get(i));
                    String etiqueta = destino < 0 ? "OTRO" : String.valueOf((char) ('A' + destino));
                    intentos.add(etiqueta + ":" + r.upstreamStatus().get(i));
                }
                patronesReintento.merge(String.join(" -> ", intentos), 1L, Long::sum);
            }
            String fin = r.upstreamFinal();
            // Solo se atribuye la respuesta final que tiene evidencia en el log.
            if (fin == null || !r.respuestaFinalAtribuible()) {
                sinUpstream++;
                continue;
            }
            int idx = indice(backends, fin);
            if (idx < 0) {
                otros++;
            } else {
                porBackend[idx]++;
            }
        }
        long total = l.registros().size();
        int sumaPesos = backends.stream().mapToInt(d -> d.peso() == null ? 0 : d.peso()).sum();

        List<ConteoInstancia> conteos = new ArrayList<>();
        long suma = sinUpstream;
        for (int i = 0; i < backends.size(); i++) {
            Destino d = backends.get(i);
            double teorico = sumaPesos == 0 || d.peso() == null ? 0 : pct(d.peso(), sumaPesos);
            conteos.add(new ConteoInstancia(String.valueOf((char) ('A' + i)), d.nombre(), d.upstream(),
                    d.peso(), teorico, porBackend[i], pct(porBackend[i], total)));
            suma += porBackend[i];
        }
        ConteoSimple sin = new ConteoSimple(sinUpstream, pct(sinUpstream, total),
                "Peticiones sin respuesta final atribuible; incluye 502/504 y tiempos ausentes");
        Conciliacion c = new Conciliacion(props.logs().ruta(), l.lineasLeidas(), 0,
                l.excluidasPorRuta(), l.invalidas(), otros, suma, suma == total);
        List<String> advertencias = new ArrayList<>();
        if (l.invalidas() > 0) advertencias.add("Conteos parciales: se excluyen líneas inválidas");
        if (otros > 0) advertencias.add("Destinos desconocidos: total no coincide con A+B+sinUpstream; revisar el catálogo");
        String estado = l.invalidas() > 0 ? "LECTURA_PARCIAL" : otros > 0 ? "DISCREPANCIA_DESTINOS"
                : l.lineasLeidas() == 0 ? "LOG_VACIO" : total == 0 ? "SIN_SOLICITUDES_PERTINENTES" : "DATOS_VALIDOS";
        IntegridadLog integridad = new IntegridadLog(estado, l.invalidas() == 0 && otros == 0,
                l.lineasLeidas(), l.lineasLeidas() - l.invalidas(), l.invalidas(), 0,
                l.excluidasPorRuta(), otros, advertencias);
        String nota = "Los porcentajes usan el total de solicitudes pertinentes. El peso 3:1 es una tendencia esperada (75/25), no una garantía exacta en muestras "
                + "pequeñas ni durante caídas: los reintentos y los servidores marcados como fallidos alteran el reparto.";
        String criterio = "ACUMULADO_LOG_SIN_FECHA: GET /api/vehiculos; una linea es una solicitud";
        String lecturaUtc = Instant.now().toString();
        BalanceoResponse balanceo = new BalanceoResponse(null, null,
                criterio, total, conteos, sin, conReintento, c, nota, integridad, lecturaUtc, patronesReintento);
        Double prom = total == 0 ? null : sumaTiempos.divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP).doubleValue();
        Double promUp = nUp == 0 ? null : sumaUp.divide(BigDecimal.valueOf(nUp), 2, RoundingMode.HALF_UP).doubleValue();
        Double max = tiempos.isEmpty() ? null : redondear(tiempos.stream().mapToDouble(Double::doubleValue).max().orElse(0));
        Double p95 = null;
        if (!tiempos.isEmpty()) {
            List<Double> orden = new ArrayList<>(tiempos);
            orden.sort(Double::compare);
            int idx = (int) Math.ceil(0.95 * orden.size()) - 1;
            p95 = redondear(orden.get(Math.max(0, idx)));
        }
        EstadisticasResponse estadisticas = new EstadisticasResponse(null, null,
                criterio, total, c2, c3, c4, c5, porCodigo, porMetodo, prom, promUp, p95, max, integridad, lecturaUtc);
        return new Agregado(balanceo, estadisticas);
    }

    private static int indice(List<Destino> backends, String upstream) {
        for (int i = 0; i < backends.size(); i++) {
            if (upstream.equals(backends.get(i).upstream())) return i;
        }
        return -1;
    }

    // ------------------------------------------------------------------ utilidades

    static double pct(long parte, long total) {
        if (total == 0) {
            return 0.0;
        }
        return BigDecimal.valueOf(parte * 100.0 / total).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static double redondear(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
