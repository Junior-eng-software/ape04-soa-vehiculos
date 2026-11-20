package ec.edu.uta.notificaciones.amqp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.TaskScheduler;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

class RecuperacionConsumidor implements ApplicationListener<ContextClosedEvent> {
    private static final Logger LOG = LoggerFactory.getLogger(RecuperacionConsumidor.class);
    private static final int ESPERA_INICIAL = 5;
    private static final int ESPERA_MAXIMA = 60;

    private final TaskScheduler planificador;
    private final Runnable verificarEscritura;
    private final AtomicBoolean suspendido = new AtomicBoolean();
    private final AtomicInteger siguienteEspera = new AtomicInteger(ESPERA_INICIAL);
    private volatile boolean cerrado;

    RecuperacionConsumidor(TaskScheduler planificador, Runnable verificarEscritura) {
        this.planificador = planificador;
        this.verificarEscritura = verificarEscritura;
    }

    void suspender(SimpleMessageListenerContainer listener) {
        if (!cerrado && suspendido.compareAndSet(false, true)) {
            programar(() -> detener(listener), 0);
        }
    }

    void confirmarRecuperacion() {
        siguienteEspera.set(ESPERA_INICIAL);
    }

    private void detener(SimpleMessageListenerContainer listener) {
        if (cerrado) {
            return;
        }
        try {
            // Se ejecuta en el planificador. stop() espera la salida del consumidor
            // y el cierre físico del canal devuelve la entrega no confirmada al broker.
            listener.stop();
        } catch (RuntimeException e) {
            LOG.error("No se completó la parada del listener. Se reintentará sin confirmar la entrega.");
            programarConEspera(() -> detener(listener));
            return;
        }
        programarConEspera(() -> comprobar(listener));
    }

    private void comprobar(SimpleMessageListenerContainer listener) {
        if (cerrado) {
            return;
        }
        try {
            verificarEscritura.run();
        } catch (RuntimeException e) {
            LOG.warn("Almacenamiento no disponible. El listener permanece suspendido.");
            programarConEspera(() -> comprobar(listener));
            return;
        }
        reanudar(listener);
    }

    private synchronized void reanudar(SimpleMessageListenerContainer listener) {
        if (cerrado) {
            return;
        }
        suspendido.set(false);
        try {
            listener.start();
        } catch (RuntimeException e) {
            LOG.warn("El listener no pudo reanudarse. Se volverá a comprobar su disponibilidad.");
            suspender(listener);
        }
    }

    private void programarConEspera(Runnable tarea) {
        int espera = siguienteEspera.getAndUpdate(segundos -> Math.min(segundos * 2, ESPERA_MAXIMA));
        programar(tarea, espera);
    }

    private void programar(Runnable tarea, int segundos) {
        if (!cerrado) {
            try {
                planificador.schedule(tarea, planificador.getClock().instant().plusSeconds(segundos));
            } catch (TaskRejectedException e) {
                if (!cerrado) {
                    LOG.error("Recuperación no programada. Se requiere intervención; no se confirmó la entrega.");
                }
            }
        }
    }

    @Override
    public synchronized void onApplicationEvent(ContextClosedEvent event) {
        cerrado = true;
    }
}
