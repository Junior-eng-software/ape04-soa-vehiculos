package ec.edu.uta.monitor.model;

import java.util.List;

/**
 * Una línea del access_log de NGINX (formato gateway) ya interpretada.
 * Las listas upstream* tienen un elemento por intento: con reintento por fallo
 * (proxy_next_upstream) hay varios, pero la PETICIÓN es una sola.
 */
public record RegistroAcceso(
        String metodo,
        String uri,
        int estado,
        List<String> upstreamAddrs,
        List<String> upstreamStatus,
        List<String> upstreamResponseTimes,
        double requestTimeSeg) {

    /** Dirección del ÚLTIMO intento (destino final) o null si NGINX no eligió ningún servidor. */
    public String upstreamFinal() {
        return upstreamAddrs.isEmpty() ? null : upstreamAddrs.get(upstreamAddrs.size() - 1);
    }

    /** Evidencia de respuesta final: el log no incluye tiempo de conexion. */
    public boolean respuestaFinalAtribuible() {
        if (upstreamStatus.isEmpty() || upstreamResponseFinalSeg() == null) return false;
        String codigo = upstreamStatus.get(upstreamStatus.size() - 1);
        return String.valueOf(estado).equals(codigo) && estado != 502 && estado != 504;
    }

    /** Número de intentos contra upstreams que hizo NGINX para esta única petición. */
    public int intentos() {
        return upstreamAddrs.size();
    }

    /** Tiempo de respuesta del último upstream en segundos, o null si no aplica. */
    public Double upstreamResponseFinalSeg() {
        if (upstreamResponseTimes.isEmpty()) {
            return null;
        }
        String v = upstreamResponseTimes.get(upstreamResponseTimes.size() - 1);
        try {
            return Double.parseDouble(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
