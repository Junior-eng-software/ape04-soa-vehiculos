package ec.edu.com;

import java.util.concurrent.CompletableFuture;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Function;

/** Coordina el sondeo dentro del hilo de la interfaz, incluso al reemplazar un JWT. */
final class SondeoNotificaciones {
    private final Function<String, CompletableFuture<NotificacionesApiClient.Resultado>> consultar;
    private final Consumer<Runnable> ejecutarEnUi;
    private final BiConsumer<NotificacionesApiClient.Resultado, Throwable> recibir;
    private String jwt = "";
    private CompletableFuture<NotificacionesApiClient.Resultado> pendiente;

    SondeoNotificaciones(Function<String, CompletableFuture<NotificacionesApiClient.Resultado>> consultar,
                         Consumer<Runnable> ejecutarEnUi,
                         BiConsumer<NotificacionesApiClient.Resultado, Throwable> recibir) {
        this.consultar = consultar;
        this.ejecutarEnUi = ejecutarEnUi;
        this.recibir = recibir;
    }

    void cambiarSesion(String nuevoJwt) {
        if (!nuevoJwt.equals(jwt)) {
            detener();
            jwt = nuevoJwt;
        }
        actualizar();
    }

    void actualizar() {
        if (jwt.isBlank() || pendiente != null) {
            return;
        }
        CompletableFuture<NotificacionesApiClient.Resultado> consulta;
        try {
            consulta = consultar.apply(jwt);
        } catch (RuntimeException error) {
            consulta = CompletableFuture.failedFuture(error);
        }
        pendiente = consulta;
        var actual = consulta;
        actual.whenComplete((resultado, error) -> {
            if (!actual.isCancelled()) {
                ejecutarEnUi.accept(() -> {
                    if (pendiente == actual) {
                        pendiente = null;
                        recibir.accept(resultado, error);
                    }
                });
            }
        });
    }

    void detener() {
        jwt = "";
        var consulta = pendiente;
        pendiente = null;
        if (consulta != null) {
            consulta.cancel(true);
        }
    }
}
