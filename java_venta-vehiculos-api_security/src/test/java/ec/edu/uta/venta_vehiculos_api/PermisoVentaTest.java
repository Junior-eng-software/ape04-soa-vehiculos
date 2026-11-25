package ec.edu.uta.venta_vehiculos_api;

import static org.hamcrest.Matchers.contains;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import ec.edu.uta.venta_vehiculos_api.controller.AdministracionController;
import ec.edu.uta.venta_vehiculos_api.controller.AuthController;
import ec.edu.uta.venta_vehiculos_api.controller.IdentidadController;
import ec.edu.uta.venta_vehiculos_api.dto.UsuarioResumen;
import ec.edu.uta.venta_vehiculos_api.exception.ApiExceptionHandler;
import ec.edu.uta.venta_vehiculos_api.model.Rol;
import ec.edu.uta.venta_vehiculos_api.repository.RolRepository;
import ec.edu.uta.venta_vehiculos_api.model.UsuarioApi;
import ec.edu.uta.venta_vehiculos_api.repository.UsuarioApiRepository;
import ec.edu.uta.venta_vehiculos_api.security.IntegrationFilter;
import ec.edu.uta.venta_vehiculos_api.security.JwtAuthenticationFilter;
import ec.edu.uta.venta_vehiculos_api.security.JwtService;
import ec.edu.uta.venta_vehiculos_api.security.SecurityConfig;
import ec.edu.uta.venta_vehiculos_api.service.UsuarioApiService;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.Filter;
import tools.jackson.databind.json.JsonMapper;

@SpringJUnitWebConfig(PermisoVentaTest.Configuracion.class)
class PermisoVentaTest {
    private static final String CLIENTE_ORDINARIO = "cliente-ordinario-pruebas";
    private static final String CLIENTE_PWA = "cliente-pwa-pruebas";
    private static final String SECRETO_ORDINARIO = UUID.randomUUID().toString();
    private static final String SECRETO_PWA = UUID.randomUUID().toString();
    private static final String CLAVE_JWT = UUID.randomUUID().toString();
    private static final String CLAVE_RESERVAS = UUID.randomUUID().toString();
    private static final String USUARIO = "usuario-pruebas";
    private static final String PASSWORD = UUID.randomUUID().toString();

    @TestConfiguration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({AuthController.class, IdentidadController.class, AdministracionController.class,
        ApiExceptionHandler.class, JwtService.class, JwtAuthenticationFilter.class,
        IntegrationFilter.class, SecurityConfig.class, UsuarioApiService.class, VehiculosSimulados.class})
    static class Configuracion {
    }

    @TestComponent
    @RestController
    static class VehiculosSimulados {
        @GetMapping({"/api/vehiculos", "/api/reservas"})
        String consultar() {
            return "OK";
        }
    }

    @DynamicPropertySource
    static void propiedades(DynamicPropertyRegistry registry) {
        registry.add("app.security.client-id", () -> CLIENTE_ORDINARIO);
        registry.add("app.security.client-secret", () -> SECRETO_ORDINARIO);
        registry.add("app.security.pwa-client-id", () -> CLIENTE_PWA);
        registry.add("app.security.pwa-client-secret", () -> SECRETO_PWA);
        registry.add("app.security.jwt-secret", () -> CLAVE_JWT);
        registry.add("app.security.ventas-key", () -> CLAVE_RESERVAS);
        registry.add("app.security.access-token-minutes", () -> 30);
        registry.add("app.security.refresh-token-minutes", () -> 60);
    }

    @MockitoBean
    private UsuarioApiRepository repository;

    @MockitoBean
    private RolRepository roles;

    @Autowired
    private PasswordEncoder encoder;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    @Qualifier("springSecurityFilterChain")
    private Filter seguridad;

    private MockMvc mvc;

    @BeforeEach
    void configurarMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(seguridad).build();
    }

    @ParameterizedTest
    @CsvSource({
        "CONSULTA, false, false", "OPERADOR, false, false", "ADMIN, false, false",
        "CONSULTA, true, false", "OPERADOR, true, true", "ADMIN, true, true"
    })
    void emitePermisoSoloParaClienteDedicadoYRolAutorizado(String rol, boolean pwa, boolean puedeVender)
            throws Exception {
        prepararUsuario(rol);
        String basic = pwa ? basic(CLIENTE_PWA, SECRETO_PWA) : basic(CLIENTE_ORDINARIO, SECRETO_ORDINARIO);
        String respuesta = login(basic, PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value(puedeVender ? "vehiculos ventas:crear" : "vehiculos"))
                .andReturn().getResponse().getContentAsString();
        var tokens = JsonMapper.shared().readTree(respuesta);
        String access = tokens.get("access_token").asString();
        ResultActions identidad = mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario").value(USUARIO))
                .andExpect(jsonPath("$.rolNombre").value(rol))
                .andExpect(jsonPath("$.roles", contains("ROLE_" + rol)));
        if (puedeVender) {
            identidad.andExpect(jsonPath("$.permisos", contains("ventas:crear")));
        } else {
            identidad.andExpect(jsonPath("$.permisos").isEmpty());
        }
        mvc.perform(get("/api/vehiculos").header(HttpHeaders.AUTHORIZATION, "Bearer " + access))
                .andExpect(status().isOk());
        String refresh = tokens.get("refresh_token").asString();
        mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, "Bearer " + refresh))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rechazaCredencialesIncorrectasYCabeceraBasicMalformada() throws Exception {
        prepararUsuario("ADMIN");
        login(basic(CLIENTE_PWA, SECRETO_ORDINARIO), PASSWORD).andExpect(status().isUnauthorized());
        login("Basic %%", PASSWORD).andExpect(status().isUnauthorized());
        login(basic(CLIENTE_PWA, SECRETO_PWA), UUID.randomUUID().toString())
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rechazaTokensVencidosOConFirmaInvalida() throws Exception {
        String vencido = emitir(CLAVE_JWT, -1, "vehiculos ventas:crear");
        String firmaInvalida = emitir(UUID.randomUUID().toString(), 30, "vehiculos ventas:crear");
        mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, "Bearer " + vencido))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, "Bearer " + firmaInvalida))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void conservaLaConsultaConJwtAnteriorYSeparaElPermisoDeLasReservas() throws Exception {
        prepararUsuario("ADMIN");
        String anterior = emitir(CLAVE_JWT, 30, "vehiculos");
        mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, "Bearer " + anterior))
                .andExpect(status().isOk()).andExpect(jsonPath("$.permisos").isEmpty());
        mvc.perform(get("/api/vehiculos").header(HttpHeaders.AUTHORIZATION, "Bearer " + anterior))
                .andExpect(status().isOk());
        String ventas = emitir(CLAVE_JWT, 30, "vehiculos ventas:crear");
        mvc.perform(get("/api/reservas").header(HttpHeaders.AUTHORIZATION, "Bearer " + ventas))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/reservas").header("X-Service-Key", CLAVE_RESERVAS))
                .andExpect(status().isOk());
    }

    @Test
    void vendedorHeredaOperadorYNoAccedeAAdministracionNiBorraVehiculos() throws Exception {
        prepararUsuario("VENDEDOR", "OPERADOR");
        String cuerpo = login(basic(CLIENTE_PWA, SECRETO_PWA), PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope").value("vehiculos ventas:crear"))
                .andReturn().getResponse().getContentAsString();
        var tokens = JsonMapper.shared().readTree(cuerpo);
        String access = tokens.get("access_token").asString();
        var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(
                CLAVE_JWT.getBytes(StandardCharsets.UTF_8))).build().parseSignedClaims(access).getPayload();
        assertEquals("OPERADOR", claims.get("rol"));
        assertEquals("VENDEDOR", claims.get("rolNombre"));
        String bearer = "Bearer " + access;
        mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", contains("ROLE_OPERADOR")))
                .andExpect(jsonPath("$.rolNombre").value("VENDEDOR"))
                .andExpect(jsonPath("$.permisos", contains("ventas:crear")));
        mvc.perform(delete("/api/vehiculos/1").header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/usuarios").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isForbidden());
        mvc.perform(post("/api/usuarios").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isForbidden());
        mvc.perform(put("/api/usuarios/1/clave").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/roles").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isForbidden());
        mvc.perform(post("/api/roles").header(HttpHeaders.AUTHORIZATION, bearer)).andExpect(status().isForbidden());
    }

    @Test
    void administradorCreaRestableceYRecibeConflictosSinExponerClaves() throws Exception {
        prepararUsuario("ADMIN");
        String admin = "Bearer " + emitir(CLAVE_JWT, 30, "vehiculos");
        String vendedor = "vendedor_demo";
        String claveInicial = UUID.randomUUID().toString();
        String claveNueva = UUID.randomUUID().toString();
        var json = JsonMapper.shared();
        byte[] datosRol = json.writeValueAsBytes(Map.of("nombre", "VENDEDOR", "rolBase", "OPERADOR", "descripcion", ""));
        doNothing().doThrow(new DataIntegrityViolationException("Duplicado"))
                .when(roles).insertar("VENDEDOR", "", "OPERADOR");
        mvc.perform(post("/api/roles").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(datosRol))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.esSistema").value(false));
        mvc.perform(post("/api/roles").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(datosRol)).andExpect(status().isConflict());
        when(roles.findById("VENDEDOR")).thenReturn(Optional.of(new Rol("VENDEDOR", "", "OPERADOR", false)));

        var guardado = new AtomicReference<UsuarioApi>();
        when(repository.saveAndFlush(any(UsuarioApi.class))).thenAnswer(invocacion -> {
            if (guardado.get() != null) throw new DataIntegrityViolationException("Duplicado");
            UsuarioApi usuario = invocacion.getArgument(0);
            usuario.setId(2);
            guardado.set(usuario);
            return usuario;
        });
        when(repository.findByUsername(vendedor)).thenAnswer(ignorado -> Optional.ofNullable(guardado.get()));
        when(repository.cambiarClave(eq(2), anyString())).thenAnswer(invocacion -> {
            guardado.get().setPassword(invocacion.getArgument(1));
            return 1;
        });

        byte[] datosUsuario = json.writeValueAsBytes(Map.of(
                "username", " VENDEDOR_DEMO ", "clave", claveInicial, "rol", "VENDEDOR"));
        mvc.perform(post("/api/usuarios").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(datosUsuario))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.username").value(vendedor))
                .andExpect(jsonPath("$.password").doesNotExist()).andExpect(jsonPath("$.clave").doesNotExist());
        assertTrue(encoder.matches(claveInicial, guardado.get().getPassword()));
        mvc.perform(post("/api/usuarios").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(datosUsuario)).andExpect(status().isConflict());

        String basic = basic(CLIENTE_PWA, SECRETO_PWA);
        login(basic, vendedor, claveInicial).andExpect(status().isOk());
        byte[] datosClave = json.writeValueAsBytes(Map.of("clave", claveNueva));
        mvc.perform(put("/api/usuarios/1/clave").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(datosClave)).andExpect(status().isForbidden());
        mvc.perform(put("/api/usuarios/2/clave").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON).content(datosClave)).andExpect(status().isNoContent());
        assertTrue(encoder.matches(claveNueva, guardado.get().getPassword()));
        login(basic, vendedor, claveInicial).andExpect(status().isUnauthorized());
        login(basic, vendedor, claveNueva).andExpect(status().isOk());
    }

    private void prepararUsuario(String rol) {
        prepararUsuario(rol, rol);
    }

    private void prepararUsuario(String rol, String base) {
        UsuarioApi usuario = new UsuarioApi();
        usuario.setId(1);
        usuario.setUsername(USUARIO);
        usuario.setRol(rol);
        usuario.setPassword(encoder.encode(PASSWORD));
        when(repository.findByUsername(USUARIO)).thenReturn(Optional.of(usuario));
        when(repository.findResumenByUsername(USUARIO)).thenReturn(Optional.of(new UsuarioResumen(1, USUARIO, rol)));
        when(roles.findById(rol)).thenReturn(Optional.of(new Rol(rol, "", base, rol.equals(base))));
    }

    private ResultActions login(String basic, String password) throws Exception {
        return login(basic, USUARIO, password);
    }

    private ResultActions login(String basic, String username, String password) throws Exception {
        return mvc.perform(post("/oauth/token").header(HttpHeaders.AUTHORIZATION, basic)
                .param("grant_type", "password").param("username", username).param("password", password)
                .param("idapli", CLIENTE_PWA).param("scope", "ventas:crear"));
    }

    private static String basic(String cliente, String secreto) {
        return "Basic " + Base64.getEncoder().encodeToString((cliente + ":" + secreto).getBytes(StandardCharsets.UTF_8));
    }

    private static String emitir(String clave, long minutos, String scope) {
        return Jwts.builder().subject(USUARIO).claim("scope", scope)
                .claim("rol", "ADMIN").claim("tipo", "access")
                .expiration(new Date(System.currentTimeMillis() + minutos * 60_000))
                .signWith(Keys.hmacShaKeyFor(clave.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }
}
