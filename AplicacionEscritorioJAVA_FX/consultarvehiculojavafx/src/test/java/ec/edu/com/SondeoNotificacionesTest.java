package ec.edu.com;

import org.junit.jupiter.api.Test;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;

class SondeoNotificacionesTest {
    private static final NotificacionesApiClient.Resultado RESPUESTA =
        new NotificacionesApiClient.Resultado(200, List.of());
    private final List<String> peticiones = new ArrayList<>();
    private final List<CompletableFuture<NotificacionesApiClient.Resultado>> operaciones = new ArrayList<>();
    private final ArrayDeque<Runnable> ui = new ArrayDeque<>();
    private final List<NotificacionesApiClient.Resultado> recibidos = new ArrayList<>();
    private final SondeoNotificaciones sondeo = new SondeoNotificaciones(jwt -> {
        peticiones.add(jwt);
        var operacion = new CompletableFuture<NotificacionesApiClient.Resultado>();
        operaciones.add(operacion);
        return operacion;
    }, ui::add, (resultado, error) -> recibidos.add(resultado));

    @Test
    void iniciaInmediatamenteYSinSolicitudesSolapadas() {
        sondeo.actualizar();
        assertTrue(peticiones.isEmpty());
        sondeo.cambiarSesion("primera");
        for (int i = 0; i < 10; i++) {
            sondeo.actualizar();
        }
        assertEquals(List.of("primera"), peticiones);
        operaciones.get(0).complete(RESPUESTA);
        sondeo.actualizar();
        assertEquals(1, peticiones.size());
        ui.remove().run();
        assertEquals(List.of(RESPUESTA), recibidos);
        sondeo.actualizar();
        assertEquals(2, peticiones.size());
    }

    @Test
    void cancelarSesionOAplicacionCancelaConsultaEImpideNuevosTicks() {
        sondeo.cambiarSesion("primera");
        sondeo.cambiarSesion("");
        assertTrue(operaciones.get(0).isCancelled());
        sondeo.actualizar();
        sondeo.cambiarSesion("segunda");
        sondeo.detener();
        assertTrue(operaciones.get(1).isCancelled());
        sondeo.actualizar();
        assertTrue(ui.isEmpty());
        assertEquals(List.of("primera", "segunda"), peticiones);
    }

    @Test
    void reemplazarJwtDescartaUnaRespuestaAnteriorEnCola() {
        sondeo.cambiarSesion("primera");
        operaciones.get(0).complete(RESPUESTA);
        sondeo.cambiarSesion("segunda");
        ui.remove().run();
        assertTrue(recibidos.isEmpty());
        operaciones.get(1).complete(RESPUESTA);
        ui.remove().run();
        assertEquals(List.of(RESPUESTA), recibidos);
    }
}
