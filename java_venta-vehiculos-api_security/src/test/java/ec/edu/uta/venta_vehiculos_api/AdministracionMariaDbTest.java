package ec.edu.uta.venta_vehiculos_api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import ec.edu.uta.venta_vehiculos_api.security.JwtService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfEnvironmentVariable(named = "VEHICULOS_TEST_DB_DATADIR", matches = ".+")
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class AdministracionMariaDbTest {
    private static final String CLIENTE = "roles-pwa-pruebas";
    private static final String SECRETO_CLIENTE = UUID.randomUUID().toString();
    private static final JsonMapper JSON = JsonMapper.shared();

    private final String sufijo = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    private final String admin = "roles_admin_" + sufijo;
    private final String usuario = "roles_usuario_" + sufijo;
    private final String rolPropio = "VENDEDOR_" + sufijo.toUpperCase(Locale.ROOT);
    private boolean baseVerificada;

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder encoder;
    @Autowired private JwtService jwt;

    @DynamicPropertySource
    static void baseDePrueba(DynamicPropertyRegistry registry) {
        int puerto = Integer.parseInt(Objects.requireNonNull(System.getenv("VEHICULOS_TEST_DB_PORT")));
        if (puerto < 49152 || puerto > 65535) {
            throw new IllegalArgumentException("El arnés requiere un puerto efímero de loopback");
        }
        registry.add("spring.datasource.url", () -> "jdbc:mysql://127.0.0.1:" + puerto + "/venta_vehiculos?useSSL=false");
        registry.add("spring.datasource.username", () -> System.getenv("VEHICULOS_TEST_DB_USER"));
        registry.add("spring.datasource.password", () -> Objects.toString(System.getenv("VEHICULOS_TEST_DB_PASSWORD"), ""));
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.sql.init.mode", () -> "never");
        registry.add("spring.jpa.show-sql", () -> false);
        registry.add("app.security.jwt-secret", UUID.randomUUID()::toString);
        registry.add("app.security.client-secret", UUID.randomUUID()::toString);
        registry.add("app.security.pwa-client-id", () -> CLIENTE);
        registry.add("app.security.pwa-client-secret", () -> SECRETO_CLIENTE);
        registry.add("app.security.ventas-key", UUID.randomUUID()::toString);
        registry.add("servicios.notificaciones.url", () -> "http://127.0.0.1:9");
        registry.add("servicios.notificaciones.key", UUID.randomUUID()::toString);
        registry.add("servicios.notificaciones.destinatario", () -> "pruebas");
    }

    @BeforeEach
    void verificarBaseAntesDeEscribir() throws Exception {
        Path configurado = Path.of(System.getenv("VEHICULOS_TEST_DB_DATADIR"));
        Path conectado = Path.of(jdbc.queryForObject("SELECT @@datadir", String.class));
        assertTrue(Files.isSameFile(configurado, conectado), "La base de pruebas no usa el directorio desechable indicado");
        baseVerificada = true;
    }

    @AfterEach
    void limpiarDatosDePrueba() {
        if (baseVerificada) {
            jdbc.update("DELETE FROM usuarios_api WHERE username IN (?, ?)", admin, usuario);
            jdbc.update("DELETE FROM roles WHERE nombre = ? AND es_sistema = 0", rolPropio);
        }
    }

    @Test
    void duplicadosDeUsuarioYRolDevuelven409DesdeMariaDb() throws Exception {
        String token = tokenAdmin();
        byte[] rol = json(Map.of("nombre", rolPropio, "rolBase", "OPERADOR", "descripcion", ""));
        mvc.perform(post("/api/roles").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(rol)).andExpect(status().isCreated());
        mvc.perform(post("/api/roles").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(rol)).andExpect(status().isConflict());

        String clave = UUID.randomUUID().toString();
        crearUsuario(token, usuario.toUpperCase(Locale.ROOT), clave, rolPropio)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.username").value(usuario));
        crearUsuario(token, usuario, clave, rolPropio).andExpect(status().isConflict());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM usuarios_api WHERE username = ?", Integer.class, usuario));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM roles WHERE nombre = ?", Integer.class, rolPropio));
    }

    @Test
    void operadorRecibe403EnLasRutasDeAdministracion() throws Exception {
        String token = bearer(datos(login(usuario, sembrarUsuario(usuario, "OPERADOR")).andExpect(status().isOk())));
        sembrarUsuario(admin, "ADMIN");
        int id = jdbc.queryForObject("SELECT id FROM usuarios_api WHERE username = ?", Integer.class, admin);
        String clave = UUID.randomUUID().toString();
        mvc.perform(get("/api/usuarios").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isForbidden());
        crearUsuario(token, usuario, clave, "CONSULTA").andExpect(status().isForbidden());
        mvc.perform(put("/api/usuarios/{id}/clave", id).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("clave", clave))))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/roles").header(HttpHeaders.AUTHORIZATION, token)).andExpect(status().isForbidden());
        mvc.perform(post("/api/roles").header(HttpHeaders.AUTHORIZATION, token).contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("nombre", rolPropio, "rolBase", "OPERADOR", "descripcion", ""))))
                .andExpect(status().isForbidden());
    }

    @Test
    void persisteBCryptYElRestablecimientoRechazaLaClaveAnterior() throws Exception {
        String token = tokenAdmin();
        String anterior = UUID.randomUUID().toString();
        String nueva = UUID.randomUUID().toString();
        var alta = crearUsuario(token, usuario, anterior, "CONSULTA").andExpect(status().isCreated())
                .andExpect(jsonPath("$.password").doesNotExist()).andExpect(jsonPath("$.clave").doesNotExist());
        int id = datos(alta).get("id").asInt();
        verificarBCrypt(id, anterior);
        login(usuario, anterior).andExpect(status().isOk());
        mvc.perform(put("/api/usuarios/{id}/clave", id).header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("clave", nueva))))
                .andExpect(status().isNoContent());
        verificarBCrypt(id, nueva);
        login(usuario, anterior).andExpect(status().isUnauthorized());
        login(usuario, nueva).andExpect(status().isOk());
    }

    @Test
    void loginConOtraCapitalizacionEmiteElUsuarioCanonicoEnAmbosJwt() throws Exception {
        String clave = sembrarUsuario("Roles_Usuario_" + sufijo, "CONSULTA");
        var tokens = datos(login(usuario.toUpperCase(Locale.ROOT), clave).andExpect(status().isOk()));
        assertEquals(usuario, jwt.validarToken(tokens.get("access_token").asString()).getSubject());
        assertEquals(usuario, jwt.validarToken(tokens.get("refresh_token").asString()).getSubject());
        mvc.perform(get("/api/identidad").header(HttpHeaders.AUTHORIZATION, bearer(tokens)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.usuario").value(usuario));
    }

    private void verificarBCrypt(int id, String clave) {
        String hash = jdbc.queryForObject("SELECT password FROM usuarios_api WHERE id = ?", String.class, id);
        assertTrue(hash != null && hash.matches("\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}"),
                "Debe persistirse un hash BCrypt");
        assertTrue(encoder.matches(clave, hash), "El hash debe corresponder a la clave de prueba");
    }

    private String sembrarUsuario(String username, String rol) {
        String clave = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO usuarios_api (username, password, rol) VALUES (?, ?, ?)", username, encoder.encode(clave), rol);
        return clave;
    }

    private String tokenAdmin() throws Exception {
        return bearer(datos(login(admin, sembrarUsuario(admin, "ADMIN")).andExpect(status().isOk())));
    }

    private ResultActions login(String username, String clave) throws Exception {
        return mvc.perform(post("/oauth/token").headers(basic())
                .param("grant_type", "password").param("username", username).param("password", clave));
    }

    private ResultActions crearUsuario(String token, String username, String clave, String rol) throws Exception {
        return mvc.perform(post("/api/usuarios").header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON).content(json(Map.of("username", username, "clave", clave, "rol", rol))));
    }

    private static HttpHeaders basic() {
        var headers = new HttpHeaders();
        headers.setBasicAuth(CLIENTE, SECRETO_CLIENTE);
        return headers;
    }

    private static JsonNode datos(ResultActions resultado) {
        return JSON.readTree(resultado.andReturn().getResponse().getContentAsByteArray());
    }

    private static String bearer(JsonNode tokens) {
        return "Bearer " + tokens.get("access_token").asString();
    }

    private static byte[] json(Map<String, String> datos) {
        return JSON.writeValueAsBytes(datos);
    }
}
