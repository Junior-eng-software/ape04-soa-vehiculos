package ec.edu.uta.monitor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * monitor-balancer-service (puerto 8083).
 * Web API independiente que OBSERVA, MIDE y ALERTA sobre NGINX y las dos
 * instancias de la API de vehículos. No modifica pesos de NGINX, no reinicia
 * procesos y no está en el camino Cliente -> NGINX -> API.
 */
@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class MonitorBalancerServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(MonitorBalancerServiceApplication.class, args);
    }
}
