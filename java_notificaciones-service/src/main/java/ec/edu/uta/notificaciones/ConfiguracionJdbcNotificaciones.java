package ec.edu.uta.notificaciones;

import java.util.Properties;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "NOTIFICACIONES_DB_HOST")
class ConfiguracionJdbcNotificaciones {
    @Bean
    DataSource notificacionesDataSource(Environment entorno) {
        String host = entorno.getRequiredProperty("NOTIFICACIONES_DB_HOST");
        int puerto = entorno.getRequiredProperty("NOTIFICACIONES_DB_PORT", Integer.class);
        var datos = new DriverManagerDataSource(
            "jdbc:mariadb://%s:%d/notificaciones_api".formatted(host, puerto),
            entorno.getRequiredProperty("NOTIFICACIONES_DB_USER"),
            entorno.getRequiredProperty("NOTIFICACIONES_DB_PASSWORD"));
        Properties limites = new Properties();
        limites.setProperty("connectTimeout", "3000");
        limites.setProperty("socketTimeout", "5000");
        datos.setConnectionProperties(limites);
        return datos;
    }
}
