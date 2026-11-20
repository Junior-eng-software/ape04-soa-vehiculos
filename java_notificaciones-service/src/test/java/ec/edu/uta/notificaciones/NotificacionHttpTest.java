package ec.edu.uta.notificaciones;

import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
    "app.consumidor-ventas.activo=false",
    "spring.config.import=optional:classpath:sin-configuracion-local.properties"
})
@AutoConfigureMockMvc
class NotificacionHttpTest {
    private static final String CLAVE_PRUEBA = UUID.randomUUID().toString();

    @Autowired
    private ApplicationContext contexto;
    @Autowired
    private MockMvc mvc;

    @DynamicPropertySource
    static void configuracionHttp(DynamicPropertyRegistry variables) {
        variables.add("app.notificacion-key", () -> CLAVE_PRUEBA);
    }

    @Test
    void protegeHttpYFuncionaConAmqpDesactivado() throws Exception {
        assertThat(contexto.getBeansOfType(SimpleMessageListenerContainer.class)).isEmpty();
        mvc.perform(post("/api/notificaciones")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/notificaciones").header("X-Notification-Key", CLAVE_PRUEBA)
                .contentType("application/json").content("""
                    {"vehiculoId":1,"destinatario":"p@example.test","tipo":"VENTA","mensaje":"prueba aislada"}
                    """))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.estado").value("ENVIADA"));
    }
}
