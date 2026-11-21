package ec.edu.uta.monitor.model;

/** Estado observado de un componente en una verificación. */
public enum EstadoComponente {
    /** Respondió y reporta salud correcta. */
    UP,
    /** No respondió (conexión rechazada / timeout) o reportó salud DOWN (HTTP 503). */
    DOWN,
    /** El proceso SÍ responde, pero niega el acceso (401/403) o el endpoint no está expuesto (404):
     *  es un problema de configuración, NO una caída de red. */
    ERROR_ACCESO,
    /** Aún no se ha observado (antes de la primera ronda). */
    DESCONOCIDO
}
