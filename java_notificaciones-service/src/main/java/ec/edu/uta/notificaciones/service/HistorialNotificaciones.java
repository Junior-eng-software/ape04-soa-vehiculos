package ec.edu.uta.notificaciones.service;

import ec.edu.uta.notificaciones.dto.AvisoVentaResponse;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import javax.sql.DataSource;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class HistorialNotificaciones {
    private final ObjectProvider<DataSource> origen;

    public HistorialNotificaciones(ObjectProvider<DataSource> origen) {
        this.origen = origen;
    }

    public List<AvisoVentaResponse> listar() {
        DataSource datos = origen.getIfAvailable();
        if (datos == null) {
            throw new DataAccessResourceFailureException("Historial JDBC no configurado");
        }
        return new JdbcTemplate(datos).query("""
            SELECT evento_id, venta_id, fecha_utc FROM notificaciones_ventas
            WHERE tipo = 'VENTA_CONFIRMADA'
            ORDER BY fecha_utc DESC, id DESC
            """, (fila, indice) -> new AvisoVentaResponse(
            fila.getString("evento_id"),
            fila.getInt("venta_id"),
            fila.getObject("fecha_utc", LocalDateTime.class).toInstant(ZoneOffset.UTC),
            "CONFIRMADA"));
    }
}
