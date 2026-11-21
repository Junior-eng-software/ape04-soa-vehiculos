package ec.edu.uta.monitor.service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.model.Alerta;
import ec.edu.uta.monitor.model.Alerta.Severidad;

/**
 * Registro EN MEMORIA de alertas de transición (últimos N eventos, por defecto 20).
 * Solo se crea una alerta cuando el estado CAMBIA respecto a la ronda anterior:
 * rondas consecutivas sin cambios no generan duplicados.
 * Limitación conocida: al reiniciar el monitor el historial se pierde.
 */
@Service
public class AlertaService {

    private static final Logger LOG = LoggerFactory.getLogger(AlertaService.class);

    private final int maximo;
    private final Deque<Alerta> alertas = new ArrayDeque<>();
    private final Map<String, String> ultimoEstado = new HashMap<>();
    private final AtomicLong secuencia = new AtomicLong();

    public AlertaService(MonitorProperties props) {
        this.maximo = props.maxAlertas();
    }

    /**
     * Compara el estado nuevo con el último conocido del componente.
     * @return la alerta creada, o null si no hubo cambio.
     */
    public synchronized Alerta registrarSiCambia(String componente, String nuevo, String contexto, Instant cuando) {
        String anterior = ultimoEstado.put(componente, nuevo);
        boolean caida = "UP".equals(anterior) && "DOWN".equals(nuevo);
        boolean recuperacion = "DOWN".equals(anterior) && "UP".equals(nuevo);
        if (!caida && !recuperacion) return null;
        Severidad sev = caida ? Severidad.CRITICA : Severidad.RECUPERACION;
        String mensaje = componente + (caida ? " cayó" : " se recuperó") + ": " + anterior + " -> " + nuevo;
        if (contexto != null && !contexto.isBlank()) mensaje += ". " + contexto;
        Alerta a = new Alerta(secuencia.incrementAndGet(), cuando, componente, anterior, nuevo, sev, mensaje);
        alertas.addFirst(a);
        while (alertas.size() > maximo) {
            alertas.removeLast();
        }
        switch (sev) {
            case CRITICA, ADVERTENCIA -> LOG.warn("ALERTA #{} [{}] {}", a.id(), sev, mensaje);
            default -> LOG.info("ALERTA #{} [{}] {}", a.id(), sev, mensaje);
        }
        return a;
    }

    /** Últimas alertas, la más reciente primero. */
    public synchronized List<Alerta> ultimas() {
        return new ArrayList<>(alertas);
    }

    public long totalGeneradas() {
        return secuencia.get();
    }

    public int maximo() {
        return maximo;
    }

}
