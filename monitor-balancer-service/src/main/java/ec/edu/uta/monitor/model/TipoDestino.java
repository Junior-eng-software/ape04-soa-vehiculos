package ec.edu.uta.monitor.model;

/** Tipo de destino del catálogo de sondeo. */
public enum TipoDestino {
    /** NGINX: se consulta /nginx-ping (no llega a los backends). */
    NGINX,
    /** Instancia de la API de vehículos: se consulta /actuator/health. */
    BACKEND,
    /** API de ventas supervisada aparte del balanceo Java. */
    FASTAPI
}
