package ec.edu.uta.venta_vehiculos_api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.math.BigDecimal;
import java.time.Year;
import java.util.Optional;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import ec.edu.uta.venta_vehiculos_api.client.NotificacionClient;
import ec.edu.uta.venta_vehiculos_api.controller.VehiculoController;
import ec.edu.uta.venta_vehiculos_api.exception.ApiError;
import ec.edu.uta.venta_vehiculos_api.exception.ApiExceptionHandler;
import ec.edu.uta.venta_vehiculos_api.model.Reserva;
import ec.edu.uta.venta_vehiculos_api.model.Vehiculo;
import ec.edu.uta.venta_vehiculos_api.repository.ReservaRepository;
import ec.edu.uta.venta_vehiculos_api.repository.VehiculoRepository;
import ec.edu.uta.venta_vehiculos_api.service.ReservaService;
import ec.edu.uta.venta_vehiculos_api.service.VehiculoService;

class VehiculoReglasTest {
    private static final String ALTA = """
            {"marca":"  AulaP27  ","modelo":" Demo ","placa":" ape2701 ",
             "chasis":" ape04p27000000001 ","anio":2026,"precio":15490.50}
            """.strip();
    private VehiculoRepository vehiculos;
    private ReservaRepository reservas;
    private NotificacionClient avisos;
    private MockMvc mvc;

    @BeforeEach
    void preparar() {
        vehiculos = mock(VehiculoRepository.class);
        reservas = mock(ReservaRepository.class);
        avisos = mock(NotificacionClient.class);
        when(vehiculos.saveAndFlush(any(Vehiculo.class))).thenAnswer(invocacion -> {
            Vehiculo vehiculo = invocacion.getArgument(0);
            vehiculo.setIdVehiculo(1);
            return vehiculo;
        });
        mvc = MockMvcBuilders.standaloneSetup(new VehiculoController(new VehiculoService(vehiculos, reservas), avisos))
                .setControllerAdvice(new ApiExceptionHandler())
                .build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", ",\"color\":null", ",\"color\":\"\"", ",\"color\":\"   \""})
    void altaConColorAusente(String color) throws Exception {
        mvc.perform(post("/api/vehiculos").contentType("application/json").content(conColor(color)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.marca").value("AulaP27"))
                .andExpect(jsonPath("$.modelo").value("Demo"))
                .andExpect(jsonPath("$.placa").value("APE2701"))
                .andExpect(jsonPath("$.chasis").value("APE04P27000000001"))
                .andExpect(jsonPath("$.estado").value("DISPONIBLE"));
        verify(vehiculos).saveAndFlush(argThat(v -> v.getColor() == null));
    }

    @Test
    void aceptaLimitesEnCaracteresUnicodeEImporteExacto() throws Exception {
        String marca = "🚗".repeat(50);
        String json = conColor(",\"color\":\" " + "x".repeat(30) + " \"")
                .replace("  AulaP27  ", marca)
                .replace(" Demo ", "m".repeat(50))
                .replace(" ape2701 ", "A1-2345678")
                .replace("15490.50", "9999999999.99");
        mvc.perform(post("/api/vehiculos").contentType("application/json").content(json))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.marca").value(marca));
        verify(vehiculos).saveAndFlush(argThat(v -> v.getColor().length() == 30
                && v.getPrecio().equals(new BigDecimal("9999999999.99"))));
    }

    static Stream<Arguments> entradasInvalidas() {
        return Stream.of(
                Arguments.of("color", conColor(",\"color\":\"" + "x".repeat(31) + "\"")),
                Arguments.of("marca", ALTA.replace("  AulaP27  ", "  ")),
                Arguments.of("modelo", ALTA.replace(" Demo ", "")),
                Arguments.of("marca", ALTA.replace("  AulaP27  ", "m".repeat(51))),
                Arguments.of("modelo", ALTA.replace(" Demo ", "m".repeat(51))),
                Arguments.of("placa", ALTA.replace(" ape2701 ", "P".repeat(11))),
                Arguments.of("chasis", ALTA.replace(" ape04p27000000001 ", "x".repeat(16))),
                Arguments.of("chasis", ALTA.replace(" ape04p27000000001 ", "x".repeat(18))),
                Arguments.of("precio", ALTA.replace("15490.50", "0")),
                Arguments.of("precio", ALTA.replace("15490.50", "-0.01")),
                Arguments.of("precio", ALTA.replace("15490.50", "15490.501")),
                Arguments.of("precio", ALTA.replace("15490.50", "10000000000"))
        );
    }

    @ParameterizedTest
    @MethodSource("entradasInvalidas")
    void rechazaDatosInvalidosEnAltaYModificacion(String campo, String datos) throws Exception {
        mvc.perform(post("/api/vehiculos").contentType("application/json").content(datos))
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.codigo").value("VALIDACION"))
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString(campo + ":")));
        mvc.perform(put("/api/vehiculos/1").contentType("application/json").content(datos))
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.codigo").value("VALIDACION"));
        verifyNoInteractions(vehiculos, avisos);
    }

    static Stream<Integer> aniosFueraDeRango() {
        return Stream.of(1899, Year.now().getValue() + 2);
    }

    @ParameterizedTest
    @MethodSource("aniosFueraDeRango")
    void mantieneRangoDeAnio(int anio) throws Exception {
        mvc.perform(post("/api/vehiculos").contentType("application/json").content(ALTA.replace("2026", "" + anio)))
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.codigo").value("ANIO_INVALIDO"));
        verifyNoInteractions(vehiculos, avisos);
    }

    @Test
    void rechazaPlacaQueSeExpandeAlNormalizar() throws Exception {
        mvc.perform(post("/api/vehiculos").contentType("application/json")
                        .content(ALTA.replace(" ape2701 ", "P".repeat(9) + "ß")))
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.codigo").value("PLACA_INVALIDA"));
        verifyNoInteractions(vehiculos, avisos);
    }

    @Test
    void modificaDisponibleYRetiraColor() throws Exception {
        Vehiculo v = existente("DISPONIBLE");
        v.setColor("Azul");
        String datos = conColor(",\"color\":\" Azul \"").replace("AulaP27", "Ferrari");
        mvc.perform(put("/api/vehiculos/1").contentType("application/json").content(datos))
                .andExpect(status().isOk()).andExpect(jsonPath("$.marca").value("Ferrari"))
                .andExpect(jsonPath("$.color").value("Azul"));
        mvc.perform(put("/api/vehiculos/1").contentType("application/json").content(ALTA))
                .andExpect(status().isOk());
        assertNull(v.getColor());
        assertEquals("DISPONIBLE", v.getEstado());
    }

    @ParameterizedTest
    @ValueSource(strings = {"RESERVADO", "VENDIDO"})
    void conservaBloqueosDeEdicionYBorrado(String estado) throws Exception {
        existente(estado);
        mvc.perform(put("/api/vehiculos/1").contentType("application/json").content(ALTA))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.codigo").value("VEHICULO_NO_DISPONIBLE"));
        mvc.perform(patch("/api/vehiculos/1").contentType("application/merge-patch+json").content("{\"precio\":1}"))
                .andExpect(status().isConflict());
        mvc.perform(delete("/api/vehiculos/1")).andExpect(status().isConflict());
        verify(vehiculos, never()).saveAndFlush(any());
        verify(vehiculos, never()).delete(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "10000000000", "9999999999.99000001", "0.010"})
    void patchRechazaSinRedondear(String precio) throws Exception {
        mvc.perform(patch("/api/vehiculos/1").contentType("application/merge-patch+json")
                        .content("{\"precio\":" + precio + "}"))
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.codigo").value("PRECIO_INVALIDO"));
        verifyNoInteractions(vehiculos, avisos);
    }

    @Test
    void patchAceptaMaximoYSigueExigiendoNumeroJson() throws Exception {
        Vehiculo v = existente("DISPONIBLE");
        mvc.perform(patch("/api/vehiculos/1").contentType("application/merge-patch+json")
                        .content("{\"precio\":9999999999.99}")).andExpect(status().isOk());
        assertEquals(new BigDecimal("9999999999.99"), v.getPrecio());
        mvc.perform(patch("/api/vehiculos/1").contentType("application/merge-patch+json")
                        .content("{\"precio\":\"10\"}"))
                .andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.codigo").value("PATCH_INVALIDO"));
        mvc.perform(patch("/api/vehiculos/1").contentType("application/merge-patch+json")
                        .content("{\"precio\":"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.codigo").value("JSON_INVALIDO"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"placa", "chasis"})
    void conflictoDeIndiceConservaElContrato409(String indice) throws Exception {
        when(vehiculos.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("Duplicado " + indice));
        mvc.perform(post("/api/vehiculos").contentType("application/json").content(ALTA))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.codigo").value("CONFLICTO_DATOS"));
        verifyNoInteractions(avisos);
    }

    @Test
    void reservaUtilizaPrecioExactoYAislaReintentos() {
        Vehiculo v = existente("DISPONIBLE");
        v.setPrecio(new BigDecimal("15490.50"));
        var servicio = new ReservaService(vehiculos, reservas);
        var primera = servicio.reservar(1, "operacion-prueba");
        assertEquals("RESERVADO", v.getEstado());
        assertEquals(v.getPrecio(), primera.precio());
        var previa = new Reserva();
        previa.id = primera.id();
        previa.vehiculo = v;
        when(reservas.findByOperacionId("operacion-prueba")).thenReturn(Optional.of(previa));
        assertEquals(primera.id(), servicio.reservar(1, "operacion-prueba").id());
        assertThrows(ApiError.class, () -> servicio.reservar(1, "otra-operacion"));
        verify(reservas, times(1)).saveAndFlush(any());
    }

    private Vehiculo existente(String estado) {
        Vehiculo v = new Vehiculo();
        v.setIdVehiculo(1);
        v.setEstado(estado);
        when(vehiculos.bloquear(1)).thenReturn(Optional.of(v));
        return v;
    }

    private static String conColor(String color) {
        return ALTA.substring(0, ALTA.length() - 1) + color + "}";
    }
}
