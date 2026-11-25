package ec.edu.uta.venta_vehiculos_api.controller;

import java.security.Principal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import ec.edu.uta.venta_vehiculos_api.dto.UsuarioResumen;
import ec.edu.uta.venta_vehiculos_api.model.Rol;
import ec.edu.uta.venta_vehiculos_api.service.UsuarioApiService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api")
public class AdministracionController {
    private static final String NOMBRE_ROL = "[A-Z0-9_]{3,30}";
    private final UsuarioApiService usuarios;

    public AdministracionController(UsuarioApiService usuarios) {
        this.usuarios = usuarios;
    }

    @GetMapping("/usuarios")
    public List<UsuarioResumen> listarUsuarios() {
        return usuarios.listarUsuarios();
    }

    @PostMapping(path = "/usuarios", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public UsuarioResumen crearUsuario(@Valid @RequestBody UsuarioNuevo datos) {
        return usuarios.crearUsuario(datos.username(), datos.clave(), datos.rol());
    }

    @PutMapping(path = "/usuarios/{id}/clave", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void restablecerClave(@PathVariable int id, @RequestBody ClaveNueva datos, Principal administrador) {
        usuarios.restablecerClave(id, datos.clave(), administrador.getName());
    }

    @GetMapping("/roles")
    public List<Rol> listarRoles() {
        return usuarios.listarRoles();
    }

    @PostMapping(path = "/roles", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public Rol crearRol(@Valid @RequestBody RolNuevo datos) {
        return usuarios.crearRol(datos.nombre(), datos.rolBase(), datos.descripcion());
    }

    public record UsuarioNuevo(@NotBlank String username, String clave,
                               @NotNull @Pattern(regexp = NOMBRE_ROL) String rol) {
        @Override public String toString() { return "UsuarioNuevo"; }
    }

    public record ClaveNueva(String clave) {
        @Override public String toString() { return "ClaveNueva"; }
    }

    public record RolNuevo(@NotNull @Pattern(regexp = NOMBRE_ROL) String nombre,
                           @NotNull @Pattern(regexp = "CONSULTA|OPERADOR|ADMIN") String rolBase,
                           @NotNull @Size(max = 255) String descripcion) {}
}
