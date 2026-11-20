package ec.edu.uta.notificaciones.amqp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.ConnectionFactory;
import org.springframework.amqp.core.AcknowledgeMode;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.amqp.rabbit.listener.api.ChannelAwareMessageListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

import java.util.Properties;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.consumidor-ventas.activo", havingValue = "true")
class ConfiguracionConsumidorVentas {
    @Bean
    CachingConnectionFactory ventasConnectionFactory(Environment entorno) {
        ConnectionFactory conexion = new ConnectionFactory();
        conexion.setHost(entorno.getRequiredProperty("AMQP_HOST"));
        conexion.setPort(entorno.getRequiredProperty("AMQP_PORT", Integer.class));
        conexion.setVirtualHost(entorno.getRequiredProperty("AMQP_VHOST"));
        conexion.setUsername(entorno.getRequiredProperty("AMQP_USER"));
        conexion.setPassword(entorno.getRequiredProperty("AMQP_PASSWORD"));
        conexion.setConnectionTimeout(3000);
        return new CachingConnectionFactory(conexion);
    }

    @Bean
    RegistroNotificaciones registroNotificaciones(Environment entorno) {
        String host = entorno.getRequiredProperty("NOTIFICACIONES_DB_HOST");
        int port = entorno.getRequiredProperty("NOTIFICACIONES_DB_PORT", Integer.class);
        var datos = new DriverManagerDataSource(
            "jdbc:mariadb://%s:%d/notificaciones_api".formatted(host, port),
            entorno.getRequiredProperty("NOTIFICACIONES_DB_USER"),
            entorno.getRequiredProperty("NOTIFICACIONES_DB_PASSWORD"));
        Properties limites = new Properties();
        limites.setProperty("connectTimeout", "3000");
        limites.setProperty("socketTimeout", "5000");
        datos.setConnectionProperties(limites);
        var registro = new RegistroNotificaciones(datos);
        registro.verificarEsquema();
        return registro;
    }

    @Bean
    ThreadPoolTaskScheduler planificadorRecuperacionVentas() {
        var planificador = new ThreadPoolTaskScheduler();
        planificador.setThreadNamePrefix("ventas-recuperacion-");
        planificador.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        return planificador;
    }

    @Bean
    RecuperacionConsumidor recuperacionConsumidor(ThreadPoolTaskScheduler planificadorRecuperacionVentas,
                                                   RegistroNotificaciones registro) {
        return new RecuperacionConsumidor(planificadorRecuperacionVentas, registro::verificarEscritura);
    }

    @Bean
    SimpleMessageListenerContainer consumidorVentas(CachingConnectionFactory ventasConnectionFactory,
                                                    RegistroNotificaciones registro, ObjectMapper mapper,
                                                    RecuperacionConsumidor recuperacion) {
        var reintentos = RetryTemplate.builder().maxAttempts(3)
            .exponentialBackoff(1000, 2, 4000).retryOn(RuntimeException.class).build();
        var listener = new SimpleMessageListenerContainer(ventasConnectionFactory);
        listener.setQueueNames("notificaciones.ventas");
        listener.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        listener.setPrefetchCount(1);
        listener.setConcurrentConsumers(1);
        listener.setForceStop(true);
        listener.setForceCloseChannel(true);
        listener.setAutoDeclare(false);
        var consumidor = new ConsumidorVentas(registro, mapper, reintentos,
            () -> recuperacion.suspender(listener), recuperacion::confirmarRecuperacion);
        listener.setMessageListener((ChannelAwareMessageListener) consumidor::recibir);
        return listener;
    }
}
