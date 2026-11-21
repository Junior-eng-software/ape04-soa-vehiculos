package ec.edu.uta.monitor.model;

import static ec.edu.uta.monitor.model.EstadoComponente.DOWN;
import static ec.edu.uta.monitor.model.EstadoComponente.ERROR_ACCESO;
import static ec.edu.uta.monitor.model.EstadoComponente.UP;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

/** Tabla de reglas de estado agregado de la Actividad 5. */
class EstadoGeneralTest {

    @Test
    void reglas() {
        assertThat(EstadoGeneral.calcular(UP, List.of(UP, UP))).isEqualTo(EstadoGeneral.NORMAL);
        assertThat(EstadoGeneral.calcular(UP, List.of(UP, DOWN))).isEqualTo(EstadoGeneral.DEGRADADO);
        assertThat(EstadoGeneral.calcular(UP, List.of(ERROR_ACCESO, UP))).isEqualTo(EstadoGeneral.DEGRADADO);
        assertThat(EstadoGeneral.calcular(UP, List.of(DOWN, DOWN))).isEqualTo(EstadoGeneral.SIN_BACKENDS);
        assertThat(EstadoGeneral.calcular(DOWN, List.of(UP, UP))).isEqualTo(EstadoGeneral.NGINX_DOWN);
        assertThat(EstadoGeneral.calcular(DOWN, List.of(DOWN, DOWN))).isEqualTo(EstadoGeneral.NGINX_DOWN);
    }
}
