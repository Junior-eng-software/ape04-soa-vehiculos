package ec.edu.uta.monitor.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.stereotype.Service;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.model.EstadoGeneral;
import ec.edu.uta.monitor.model.Verificacion;

/**
 * Almacén en memoria de la última ronda de verificación y de un historial corto
 * por destino. Los endpoints leen de aquí: responder al cliente NUNCA espera a
 * que un backend conteste (no hay bloqueo indefinido).
 */
@Service
public class EstadoService {

    /** Foto inmutable de una ronda completa. */
    public record Ronda(long numero, Instant fecha, Verificacion nginx, List<Verificacion> backends,
                        Verificacion fastapi, EstadoGeneral estadoGeneral) {
        public Ronda { backends = List.copyOf(backends); }
        public long backendsUp() {
            return backends.stream().filter(v -> v.estado() == ec.edu.uta.monitor.model.EstadoComponente.UP).count();
        }
    }

    /** Ronda e historiales inmutables publicados juntos; GET captura esta referencia una sola vez. */
    public record Vista(Ronda ronda, Map<String, List<Verificacion>> historiales) {
        public Vista {
            Map<String, List<Verificacion>> copia = new LinkedHashMap<>();
            historiales.forEach((id, lista) -> copia.put(id, List.copyOf(lista)));
            historiales = Map.copyOf(copia);
        }
        public List<Verificacion> historial(String id) { return historiales.getOrDefault(id, List.of()); }
    }

    private final AtomicReference<Vista> ultima = new AtomicReference<>(new Vista(null, Map.of()));
    private final int maxHistorial;

    public EstadoService(MonitorProperties props) {
        this.maxHistorial = Math.max(1, props.historialPorDestino());
    }

    public synchronized void publicar(Ronda ronda) {
        Map<String, List<Verificacion>> historial = new LinkedHashMap<>(ultima.get().historiales());
        guardar(historial, ronda.nginx());
        guardar(historial, ronda.fastapi());
        ronda.backends().forEach(v -> guardar(historial, v));
        ultima.set(new Vista(ronda, historial));
    }

    private void guardar(Map<String, List<Verificacion>> historial, Verificacion v) {
        List<Verificacion> lista = new ArrayList<>();
        lista.add(v);
        lista.addAll(historial.getOrDefault(v.destinoId(), List.of()));
        historial.put(v.destinoId(), List.copyOf(lista.subList(0, Math.min(maxHistorial, lista.size()))));
    }

    /** Última ronda o null si todavía no se completó ninguna. */
    public Ronda ultimaRonda() {
        return vista().ronda();
    }

    public Vista vista() { return ultima.get(); }

    public List<Verificacion> historial(String destinoId) {
        return vista().historial(destinoId);
    }
}
