package ec.edu.uta.monitor.exception;

import ec.edu.uta.monitor.dto.IntegridadLog;

/** Un archivo no vacío sin un solo registro válido no representa cero tráfico. */
public class LogInvalidoException extends RuntimeException {
    private final IntegridadLog diagnostico;

    public LogInvalidoException(long leidas, long invalidas) {
        super("El log no contiene registros compatibles con el formato configurado");
        diagnostico = new IntegridadLog("LOG_INVALIDO", false, leidas, 0, invalidas, 0, 0, 0,
                java.util.List.of("No se publican métricas de un log totalmente inválido"));
    }

    public IntegridadLog getDiagnostico() { return diagnostico; }
}
