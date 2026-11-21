package ec.edu.uta.monitor.exception;

/** El access_log de NGINX no existe o no se puede leer con los permisos actuales. */
public class LogNoDisponibleException extends RuntimeException {
    private final String ruta;
    private final String motivo;

    public LogNoDisponibleException(String ruta) {
        this(ruta, "ARCHIVO_INACCESIBLE");
    }

    public LogNoDisponibleException(String ruta, String motivo) {
        super("No se puede leer el access_log de NGINX en la ruta configurada");
        this.ruta = ruta;
        this.motivo = motivo;
    }

    public String getRuta() {
        return ruta;
    }

    public String getMotivo() { return motivo; }
}
