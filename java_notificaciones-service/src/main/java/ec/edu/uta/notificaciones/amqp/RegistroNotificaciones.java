package ec.edu.uta.notificaciones.amqp;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

class RegistroNotificaciones {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaccion;

    RegistroNotificaciones(DataSource dataSource) {
        jdbc = new JdbcTemplate(dataSource);
        transaccion = new TransactionTemplate(new JdbcTransactionManager(dataSource));
        transaccion.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    void verificarEsquema() {
        jdbc.queryForList("""
            SELECT evento_id, tipo, venta_id, vehiculo_id, fecha_utc FROM notificaciones_ventas WHERE 1=0
            """);
        jdbc.queryForList("SELECT motivo, recibida_utc FROM notificaciones_cuarentena WHERE 1=0");
    }

    void guardar(EventoVenta evento) {
        try {
            transaccion.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO notificaciones_ventas (evento_id, tipo, venta_id, vehiculo_id, fecha_utc)
                VALUES (?, ?, ?, ?, ?)
                """, evento.eventoId(), evento.tipo(), evento.ventaId(), evento.vehiculoId(), evento.fechaUtc()));
        } catch (DuplicateKeyException duplicado) {
            var persistidos = jdbc.query("""
                SELECT evento_id, tipo, venta_id, vehiculo_id, fecha_utc
                FROM notificaciones_ventas WHERE evento_id=?
                """, (fila, numero) -> new EventoVenta(fila.getString("evento_id"), fila.getString("tipo"),
                    fila.getInt("venta_id"), fila.getInt("vehiculo_id"),
                    fila.getObject("fecha_utc", LocalDateTime.class)), evento.eventoId());
            if (persistidos.isEmpty()) {
                throw duplicado;
            }
            if (!evento.equals(persistidos.get(0))) {
                throw new EventoVenta.Invalido("EVENTO_ID_CONFLICTIVO");
            }
        }
    }

    void guardarCuarentena(String motivo) {
        transaccion.executeWithoutResult(status -> jdbc.update("""
            INSERT INTO notificaciones_cuarentena (motivo, recibida_utc) VALUES (?, ?)
            """, motivo, LocalDateTime.now(ZoneOffset.UTC)));
    }
}
