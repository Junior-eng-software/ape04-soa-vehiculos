package ec.edu.uta.notificaciones.amqp;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;
import com.rabbitmq.client.Channel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.retry.support.RetryTemplate;

import java.io.IOException;

class ConsumidorVentas {
    private static final Logger LOG = LoggerFactory.getLogger(ConsumidorVentas.class);
    private final RegistroNotificaciones registro;
    private final ObjectReader lector;
    private final RetryTemplate reintentos;
    private final Runnable suspenderRecepcion;
    private final Runnable confirmarRecuperacion;

    ConsumidorVentas(RegistroNotificaciones registro, ObjectMapper mapper, RetryTemplate reintentos,
                     Runnable suspenderRecepcion, Runnable confirmarRecuperacion) {
        this.registro = registro;
        this.reintentos = reintentos;
        this.suspenderRecepcion = suspenderRecepcion;
        this.confirmarRecuperacion = confirmarRecuperacion;
        lector = mapper.readerFor(JsonNode.class)
            .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS, DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY);
    }

    void recibir(Message mensaje, Channel canal) throws IOException {
        long entrega = mensaje.getMessageProperties().getDeliveryTag();
        try {
            reintentos.execute(contexto -> {
                try {
                    registro.guardar(EventoVenta.leer(mensaje, lector));
                } catch (EventoVenta.Invalido invalido) {
                    registro.guardarCuarentena(invalido.getMessage());
                    LOG.warn("Evento conservado en cuarentena. Motivo {}", invalido.getMessage());
                }
                return null;
            });
        } catch (RuntimeException e) {
            LOG.warn("Persistencia sin confirmar tras reintentos. Se suspende la recepción.");
            // Con prefetch 1, la entrega sin ACK retiene el crédito hasta que Spring cierre el canal.
            suspenderRecepcion.run();
            return;
        }
        canal.basicAck(entrega, false);
        confirmarRecuperacion.run();
    }
}
