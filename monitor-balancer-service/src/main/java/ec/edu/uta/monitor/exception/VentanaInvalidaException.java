package ec.edu.uta.monitor.exception;

/** Parámetros desde/hasta mal formados o en orden incorrecto. */
public class VentanaInvalidaException extends RuntimeException {
    public VentanaInvalidaException(String mensaje) {
        super(mensaje);
    }
}
