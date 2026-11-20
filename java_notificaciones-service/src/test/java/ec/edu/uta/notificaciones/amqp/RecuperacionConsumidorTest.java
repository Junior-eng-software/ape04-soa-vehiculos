package ec.edu.uta.notificaciones.amqp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.scheduling.TaskScheduler;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RecuperacionConsumidorTest {
    private static final Instant AHORA = Instant.parse("2026-11-20T05:00:00Z");
    private final TaskScheduler planificador = mock(TaskScheduler.class);
    private final SimpleMessageListenerContainer listener = mock(SimpleMessageListenerContainer.class);
    private final Deque<Tarea> tareas = new ArrayDeque<>();

    RecuperacionConsumidorTest() {
        when(planificador.getClock()).thenReturn(Clock.fixed(AHORA, ZoneOffset.UTC));
        when(planificador.schedule(any(Runnable.class), any(Instant.class))).thenAnswer(invocacion -> {
            tareas.add(new Tarea(invocacion.getArgument(0), invocacion.getArgument(1)));
            return null;
        });
    }

    @Test
    void programaUnaSolaParadaYNoReanudaHastaQueElSondeoFuncione() {
        Runnable comprobar = mock(Runnable.class);
        doThrow(new DataAccessResourceFailureException("no disponible"))
            .doThrow(new DataAccessResourceFailureException("no disponible"))
            .doThrow(new DataAccessResourceFailureException("no disponible"))
            .doThrow(new DataAccessResourceFailureException("no disponible"))
            .doThrow(new DataAccessResourceFailureException("no disponible"))
            .doNothing().when(comprobar).run();
        var recuperacion = new RecuperacionConsumidor(planificador, comprobar);

        recuperacion.suspender(listener);
        recuperacion.suspender(listener);
        assertThat(tareas).hasSize(1);
        verifyNoInteractions(listener, comprobar);
        ejecutar(0);
        verify(listener).stop();
        for (long segundos : new long[]{5, 10, 20, 40, 60}) {
            ejecutar(segundos);
            verify(listener, never()).start();
        }
        ejecutar(60);
        verify(listener).start();
        assertThat(tareas).isEmpty();

        // Un sondeo exitoso no restablece la espera hasta que haya un ACK.
        recuperacion.suspender(listener);
        ejecutar(0);
        ejecutar(60);
        recuperacion.confirmarRecuperacion();
        recuperacion.suspender(listener);
        ejecutar(0);
        ejecutar(5);
    }

    @Test
    void cierreDelContextoImpideReactivarUnListenerSuspendido() {
        Runnable comprobar = mock(Runnable.class);
        var recuperacion = new RecuperacionConsumidor(planificador, comprobar);
        recuperacion.suspender(listener);
        ejecutar(0);
        recuperacion.onApplicationEvent(new ContextClosedEvent(mock(ApplicationContext.class)));
        ejecutar(5);
        verify(listener, never()).start();
        verifyNoInteractions(comprobar);
        assertThat(tareas).isEmpty();
    }

    @Test
    void entregaSinConfirmarQuedaPendienteHastaQueVuelveElAlmacenamiento() throws Exception {
        RegistroNotificaciones registro = mock(RegistroNotificaciones.class);
        Channel canal = mock(Channel.class);
        var disponible = new AtomicBoolean();
        var persistido = new AtomicBoolean();
        Runnable verificar = () -> {
            if (!disponible.get()) {
                throw new DataAccessResourceFailureException("DB temporalmente caída");
            }
        };
        doAnswer(invocacion -> {
            verificar.run();
            persistido.set(true);
            return null;
        }).when(registro).guardar(any());
        var recuperacion = new RecuperacionConsumidor(planificador, verificar);
        var consumidor = new ConsumidorVentas(registro, new ObjectMapper(),
            RetryTemplate.builder().maxAttempts(3).noBackoff().build(),
            () -> recuperacion.suspender(listener), recuperacion::confirmarRecuperacion);

        // Doble de broker: el canal retiene la entrega hasta que se cierre o se confirme.
        var enVuelo = new AtomicReference<>(mensaje());
        var pendiente = new AtomicReference<Message>();
        doAnswer(invocacion -> {
            pendiente.set(enVuelo.getAndSet(null));
            return null;
        }).when(listener).stop();
        consumidor.recibir(enVuelo.get(), canal);
        verifyNoInteractions(canal);
        assertThat(enVuelo.get()).isNotNull();
        assertThat(pendiente.get()).isNull();
        ejecutar(0);
        assertThat(pendiente.get()).isNotNull();
        ejecutar(5);
        verify(listener, never()).start();
        verify(registro, times(3)).guardar(any());

        disponible.set(true);
        ejecutar(10);
        verify(listener).start();
        enVuelo.set(pendiente.getAndSet(null));
        doAnswer(invocacion -> {
            assertThat(persistido).isTrue();
            enVuelo.set(null);
            return null;
        }).when(canal).basicAck(1L, false);
        consumidor.recibir(enVuelo.get(), canal);
        verify(canal).basicAck(1L, false);
        verifyNoMoreInteractions(canal);
        assertThat(enVuelo.get()).isNull();
        assertThat(pendiente.get()).isNull();
    }

    private void ejecutar(long segundos) {
        Tarea tarea = tareas.remove();
        assertThat(tarea.fecha()).isEqualTo(AHORA.plusSeconds(segundos));
        tarea.accion().run();
    }

    private static Message mensaje() {
        var propiedades = new MessageProperties();
        propiedades.setContentType("application/json");
        propiedades.setDeliveryTag(1);
        String json = """
            {"eventoId":"9fed4314-6a1e-4a25-a589-cb3bcbe09bff","tipo":"VENTA_CONFIRMADA","ventaId":21,
             "vehiculoId":42,"fechaUTC":"2026-11-18T18:12:16Z"}
            """;
        return new Message(json.getBytes(StandardCharsets.UTF_8), propiedades);
    }

    private record Tarea(Runnable accion, Instant fecha) {}
}
