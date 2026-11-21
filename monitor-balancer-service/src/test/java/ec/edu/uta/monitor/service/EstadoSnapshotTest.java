package ec.edu.uta.monitor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import ec.edu.uta.monitor.TestSupport;
import ec.edu.uta.monitor.model.EstadoComponente;

class EstadoSnapshotTest {
    @Test void vistaCapturadaNoCambiaAlPublicarOtraRonda() {
        var s = new EstadoService(TestSupport.props("no-usado"));
        s.publicar(TestSupport.ronda(1, EstadoComponente.UP));
        var anterior = s.vista();
        s.publicar(TestSupport.ronda(2, EstadoComponente.DOWN));
        assertThat(anterior.ronda().numero()).isEqualTo(1);
        assertThat(anterior.historial("api-b").get(0).estado()).isEqualTo(EstadoComponente.UP);
        assertThat(s.vista().historial("api-b").get(0).estado()).isEqualTo(EstadoComponente.DOWN);
        assertThatThrownBy(() -> anterior.historial("api-b").clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> anterior.historiales().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void publicacionesConcurrentesNoMezclanRondaEHistorial() throws Exception {
        var s = new EstadoService(TestSupport.props("no-usado"));
        var executor = Executors.newSingleThreadExecutor();
        try {
            var tarea = executor.submit(() -> {
                for (int i = 1; i <= 1000; i++) s.publicar(TestSupport.ronda(i, i % 2 == 0 ? EstadoComponente.DOWN : EstadoComponente.UP));
            });
            for (int i = 0; i < 2000; i++) {
                var vista = s.vista();
                if (vista.ronda() == null) continue;
                assertThat(vista.historial("nginx").get(0)).isEqualTo(vista.ronda().nginx());
                for (var backend : vista.ronda().backends()) {
                    assertThat(vista.historial(backend.destinoId()).get(0)).isEqualTo(backend);
                }
            }
            tarea.get(10, java.util.concurrent.TimeUnit.SECONDS);
            assertThat(s.vista().historial("api-b")).hasSize(5);
        } finally { executor.shutdownNow(); }
    }
}
