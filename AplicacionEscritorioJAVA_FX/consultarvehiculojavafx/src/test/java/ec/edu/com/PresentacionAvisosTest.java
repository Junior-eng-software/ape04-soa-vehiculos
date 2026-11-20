package ec.edu.com;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class PresentacionAvisosTest {
    @Test
    void actualizarEjecutaSoloLaAccionDeLaPestanaActiva() {
        var ejecuciones = new java.util.ArrayList<String>();
        Runnable vehiculos = () -> ejecuciones.add("vehículos");
        Runnable avisos = () -> ejecuciones.add("notificaciones");
        VehiculosApp.Seccion.NOTIFICACIONES.actualizar(vehiculos, avisos);
        VehiculosApp.Seccion.VEHICULOS.actualizar(vehiculos, avisos);
        assertEquals(List.of("notificaciones", "vehículos"), ejecuciones);
    }
    @Test
    void convierteEnGuayaquilInclusoAlCambiarDeDia() {
        assertEquals("19/11/2026 22:56:52", PresentacionAvisos.fechaLocal("2026-11-20T03:56:52Z"));
        assertEquals("—", PresentacionAvisos.fechaLocal("no-es-fecha"));
    }

    @Test
    void abreviaEventoSinCambiarElValorDelAviso() {
        String id = "12345678-1234-1234-1234-12345678abcd";
        var aviso = new AvisoVenta(id, 1, "2026-11-20T03:56:52Z", "CONFIRMADA");
        assertEquals("12345678…abcd", PresentacionAvisos.abreviarEvento(aviso.eventoId()));
        assertEquals(id, aviso.eventoId());
        assertEquals("2026-11-20T03:56:52Z", aviso.fechaUTC());
    }

    @Test
    void diferenciaRespuestasYErrores() {
        var vacio = new NotificacionesApiClient.Resultado(200, List.of());
        var exito = new NotificacionesApiClient.Resultado(200,
            List.of(new AvisoVenta("evento-prueba", 1, "2026-11-20T03:56:52Z", "CONFIRMADA")));
        assertEquals(PresentacionAvisos.Estado.VACIO, PresentacionAvisos.estado(vacio, null));
        assertEquals(PresentacionAvisos.Estado.EXITO, PresentacionAvisos.estado(exito, null));
        assertEquals(PresentacionAvisos.Estado.ERROR, PresentacionAvisos.estado(null, new java.io.IOException()));
        assertEquals(PresentacionAvisos.Estado.ERROR,
            PresentacionAvisos.estado(new NotificacionesApiClient.Resultado(503, List.of()), null));
    }

    @Test
    void cssAccesibleDesdeClasspathSinAbrirJavafx() throws Exception {
        var recurso = AvisoVenta.class.getResource("vehiculos.css");
        assertNotNull(recurso);
        try (var entrada = recurso.openStream()) {
            var css = new String(entrada.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            assertTrue(css.contains(".aviso-carga"));
            assertTrue(css.contains(".barra-estado"));
        }
    }
}
