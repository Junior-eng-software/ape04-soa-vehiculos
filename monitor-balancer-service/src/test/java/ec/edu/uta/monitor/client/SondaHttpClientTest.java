package ec.edu.uta.monitor.client;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.ConnectException;
import java.net.http.HttpTimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import ec.edu.uta.monitor.TestSupport;
import ec.edu.uta.monitor.model.EstadoComponente;
import ec.edu.uta.monitor.service.ClasificadorSalud;

class SondaHttpClientTest {
    @Test void conexionRechazadaSimuladaNoHacePeticionesReales() {
        comprobar(new ConnectException("simulado"), "Conexión rechazada");
    }

    @Test void timeoutSimuladoNoHacePeticionesReales() {
        comprobar(new HttpTimeoutException("simulado"), "Timeout de lectura");
    }

    private void comprobar(java.io.IOException fallo, String diagnostico) {
        var props = TestSupport.props("no-usado");
        // Fábrica falsa: falla antes de crear una conexión o un socket.
        RestClient cliente = RestClient.builder().requestFactory((uri, method) -> { throw fallo; }).build();
        var r = new SondaHttpClient(cliente, props).sondear(props.backends().get(0));
        assertThat(r.codigoHttp()).isNull();
        assertThat(r.latenciaMs()).isNull();
        assertThat(r.error()).contains(diagnostico);
        assertThat(new ClasificadorSalud().clasificar(props.backends().get(0).tipo(), r).estado())
                .isEqualTo(EstadoComponente.DOWN);
    }
}
