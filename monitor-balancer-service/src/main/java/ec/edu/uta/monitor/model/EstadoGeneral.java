package ec.edu.uta.monitor.model;

import java.util.List;

/** Estado agregado de la infraestructura según las reglas de la Actividad 5. */
public enum EstadoGeneral {
    /** NGINX responde y los dos backends están UP. */
    NORMAL,
    /** NGINX responde y exactamente un backend está UP. */
    DEGRADADO,
    /** NGINX responde pero ningún backend está UP. */
    SIN_BACKENDS,
    /** La comprobación directa de NGINX no obtiene respuesta válida (los backends se informan igual). */
    NGINX_DOWN,
    /** Todavía no hay una ronda de verificación completa. */
    SIN_DATOS;

    /** Aplica la tabla de reglas de estado agregado. */
    public static EstadoGeneral calcular(EstadoComponente nginx, List<EstadoComponente> backends) {
        if (nginx != EstadoComponente.UP) {
            return NGINX_DOWN;
        }
        long up = backends.stream().filter(e -> e == EstadoComponente.UP).count();
        if (up == backends.size()) {
            return NORMAL;
        }
        if (up == 0) {
            return SIN_BACKENDS;
        }
        return DEGRADADO;   // con dos backends: exactamente uno UP
    }
}
