package ec.edu.uta.notificaciones.amqp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.core.io.FileSystemResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.retry.support.RetryTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ConsumidorVentasTest {
    private static final String ID = "9fed4314-6a1e-4a25-a589-cb3bcbe09bff";
    private static final String OTRO_ID = "763afa48-3fd8-463f-b76c-0d53d22d9f06";
    private static final String JSON = """
        {"eventoId":"%s","tipo":"VENTA_CONFIRMADA","ventaId":21,"vehiculoId":42,"fechaUTC":"2026-11-18T18:12:16.000123Z"}
        """;

    @TempDir
    Path directorio;
    private String url;
    private RegistroNotificaciones registro;
    private JdbcTemplate jdbc;

    @BeforeEach
    void prepararBase() {
        url = "jdbc:h2:file:" + directorio.resolve("notificaciones").toString().replace('\\', '/')
            + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE";
        var inicial = new DriverManagerDataSource(url, "sa", "");
        new ResourceDatabasePopulator(new FileSystemResource("sql/001_notificaciones.sql")).execute(inicial);
        registro = new RegistroNotificaciones(datos());
        registro.verificarEsquema();
        jdbc = new JdbcTemplate(datos());
    }

    private DriverManagerDataSource datos() {
        return new DriverManagerDataSource(url + ";SCHEMA=notificaciones_api", "sa", "");
    }

    @Test
    void confirmaDespuesDeQueOtraConexionPuedeLeerElEvento() throws Exception {
        Channel canal = mock(Channel.class);
        doAnswer(invocacion -> {
            assertThat(cantidad("notificaciones_ventas")).isOne();
            assertThat(jdbc.queryForObject("SELECT venta_id FROM notificaciones_ventas", Integer.class)).isEqualTo(21);
            return null;
        }).when(canal).basicAck(1L, false);
        consumidor(registro).recibir(mensaje(JSON.formatted(ID), 1), canal);
        verify(canal).basicAck(1L, false);
        verifyNoMoreInteractions(canal);
    }

    @Test
    void reentregaTrasPerderAckYRecrearConsumidorConservaUnSoloAviso() throws Exception {
        Channel canalInicial = mock(Channel.class);
        doThrow(new IOException("pérdida simulada de ACK")).when(canalInicial).basicAck(1L, false);
        assertThatThrownBy(() -> consumidor(registro).recibir(mensaje(JSON.formatted(ID), 1), canalInicial))
            .isInstanceOf(IOException.class);
        assertThat(cantidad("notificaciones_ventas")).isOne();

        var otroConsumidor = consumidor(new RegistroNotificaciones(datos()));
        Channel nuevoCanal = mock(Channel.class);
        otroConsumidor.recibir(mensaje(JSON.formatted(ID), 2), nuevoCanal);
        assertThat(cantidad("notificaciones_ventas")).isOne();
        otroConsumidor.recibir(mensaje(JSON.formatted(OTRO_ID), 3), nuevoCanal);
        verify(nuevoCanal).basicAck(2L, false);
        verify(nuevoCanal).basicAck(3L, false);
        assertThat(cantidad("notificaciones_ventas")).isEqualTo(2);
        assertThat(cantidad("notificaciones_cuarentena")).isZero();
    }

    @Test
    void guardaConflictoDeUuidEnCuarentenaSinDuplicarAviso() throws Exception {
        Channel canal = mock(Channel.class);
        var consumidor = consumidor(registro);
        String original = JSON.formatted(ID);
        consumidor.recibir(mensaje(original, 1), canal);
        consumidor.recibir(mensaje(original.replace("\"ventaId\":21", "\"ventaId\":99"), 2), canal);

        assertThat(cantidad("notificaciones_ventas")).isOne();
        assertThat(jdbc.queryForObject("SELECT motivo FROM notificaciones_cuarentena", String.class))
            .isEqualTo("EVENTO_ID_CONFLICTIVO");
        verify(canal).basicAck(2L, false);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{",
        "{\"eventoId\":\"%s\",\"tipo\":\"VENTA_CONFIRMADA\",\"ventaId\":1,\"vehiculoId\":2,\"fechaUTC\":\"2026-06-01T00:00:00Z\",\"correo\":\"ejemplo@test.invalid\"}",
        "{\"eventoId\":\"%s\",\"tipo\":\"VENTA_CONFIRMADA\",\"ventaId\":1,\"ventaId\":2,\"vehiculoId\":2,\"fechaUTC\":\"2026-06-01T00:00:00Z\"}",
        "{\"eventoId\":\"%s\",\"tipo\":\"OTRO\",\"ventaId\":1,\"vehiculoId\":2,\"fechaUTC\":\"2026-06-01T00:00:00Z\"}"
    })
    void invalidoQuedaEnCuarentenaAntesDelAck(String cuerpo) throws Exception {
        Channel canal = mock(Channel.class);
        doAnswer(invocacion -> {
            assertThat(cantidad("notificaciones_cuarentena")).isOne();
            assertThat(cantidad("notificaciones_ventas")).isZero();
            return null;
        }).when(canal).basicAck(1L, false);
        consumidor(registro).recibir(mensaje(cuerpo.formatted(ID), 1), canal);
        verify(canal).basicAck(1L, false);
    }

    @Test
    void falloPersistenteSolicitaParadaTrasTresIntentosSinAckNiNack() throws Exception {
        Channel canal = mock(Channel.class);
        RegistroNotificaciones sinBase = mock(RegistroNotificaciones.class);
        Runnable parar = mock(Runnable.class);
        Runnable recuperada = mock(Runnable.class);
        doThrow(new DataAccessResourceFailureException("fallo simulado")).when(sinBase).guardar(any());
        consumidor(sinBase, parar, recuperada).recibir(mensaje(JSON.formatted(ID), 1), canal);
        var orden = inOrder(sinBase, parar);
        orden.verify(sinBase, times(3)).guardar(any());
        orden.verify(parar).run();
        verifyNoInteractions(canal, recuperada);
    }

    @Test
    void falloEnCuarentenaSuspendeSinConfirmarYConservaLaReentrega() throws Exception {
        Channel canal = mock(Channel.class);
        RegistroNotificaciones intermitente = spy(registro);
        doThrow(new DataAccessResourceFailureException("fallo simulado"))
            .doThrow(new DataAccessResourceFailureException("fallo simulado"))
            .doThrow(new DataAccessResourceFailureException("fallo simulado"))
            .doCallRealMethod().when(intermitente).guardarCuarentena("JSON_INVALIDO");
        Runnable parar = mock(Runnable.class);
        var consumidor = consumidor(intermitente, parar, () -> {});
        consumidor.recibir(mensaje("{", 1), canal);
        verify(parar).run();
        verifyNoInteractions(canal);
        assertThat(cantidad("notificaciones_cuarentena")).isZero();

        consumidor.recibir(mensaje("{", 2), canal);
        assertThat(cantidad("notificaciones_cuarentena")).isOne();
        verify(canal).basicAck(2L, false);
        verifyNoMoreInteractions(canal);
    }

    @Test
    void sondeoCompruebaEscrituraEnAmbasTablasSinInsertarFilas() {
        registro.verificarEscritura();
        assertThat(cantidad("notificaciones_ventas")).isZero();
        assertThat(cantidad("notificaciones_cuarentena")).isZero();
    }

    @Test
    void falloTransitorioSeRecuperaAntesDeConfirmar() throws Exception {
        Channel canal = mock(Channel.class);
        RegistroNotificaciones intermitente = spy(registro);
        doThrow(new DataAccessResourceFailureException("fallo simulado"))
            .doCallRealMethod().when(intermitente).guardar(any());
        consumidor(intermitente).recibir(mensaje(JSON.formatted(ID), 1), canal);
        verify(intermitente, times(2)).guardar(any());
        assertThat(cantidad("notificaciones_ventas")).isOne();
        verify(canal).basicAck(1L, false);
        verifyNoMoreInteractions(canal);
    }

    private int cantidad(String tabla) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + tabla, Integer.class);
    }

    private static ConsumidorVentas consumidor(RegistroNotificaciones registro) {
        return consumidor(registro, () -> {}, () -> {});
    }

    private static ConsumidorVentas consumidor(RegistroNotificaciones registro, Runnable parar, Runnable recuperada) {
        return new ConsumidorVentas(registro, new ObjectMapper(),
            RetryTemplate.builder().maxAttempts(3).noBackoff().build(), parar, recuperada);
    }

    private static Message mensaje(String json, long entrega) {
        var propiedades = new MessageProperties();
        propiedades.setContentType("application/json");
        propiedades.setDeliveryTag(entrega);
        return new Message(json.getBytes(StandardCharsets.UTF_8), propiedades);
    }
}
