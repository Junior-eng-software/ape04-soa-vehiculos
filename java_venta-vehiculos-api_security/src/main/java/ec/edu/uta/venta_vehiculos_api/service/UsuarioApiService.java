package ec.edu.uta.venta_vehiculos_api.service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ec.edu.uta.venta_vehiculos_api.dto.UsuarioResumen;
import ec.edu.uta.venta_vehiculos_api.exception.ApiError;
import ec.edu.uta.venta_vehiculos_api.model.Rol;
import ec.edu.uta.venta_vehiculos_api.model.UsuarioApi;
import ec.edu.uta.venta_vehiculos_api.repository.RolRepository;
import ec.edu.uta.venta_vehiculos_api.repository.UsuarioApiRepository;

@Service
public class UsuarioApiService {

    private final UsuarioApiRepository repository;
    private final RolRepository roles;
    private final PasswordEncoder passwordEncoder;

    public UsuarioApiService(
            UsuarioApiRepository repository,
            RolRepository roles,
            PasswordEncoder passwordEncoder) {

        this.repository = repository;
        this.roles = roles;
        this.passwordEncoder = passwordEncoder;
    }

    public record UsuarioAutenticado(String username, Rol rol) {}

    public UsuarioAutenticado autenticar(
            String username,
            String password) {

        UsuarioApi usuario =
                repository.findByUsername(username)
                        .orElseThrow(() ->
                                new IllegalArgumentException(
                                        "Usuario o contraseña incorrectos"
                                )
                        );

        if (!passwordEncoder.matches(
                password,
                usuario.getPassword())) {

            throw new IllegalArgumentException(
                    "Usuario o contraseña incorrectos"
            );
        }

        return new UsuarioAutenticado(usuario.getUsername().toLowerCase(Locale.ROOT), resolverRol(usuario.getRol()));
    }

    public Rol rolDeUsuario(String username) {
        UsuarioResumen usuario = repository.findResumenByUsername(username)
                .orElseThrow(() -> new ApiError(401, "USUARIO_INVALIDO", "Usuario no disponible"));
        return resolverRol(usuario.rol());
    }

    private Rol resolverRol(String nombre) {
        return roles.findById(nombre)
                .orElseThrow(() -> new IllegalStateException("El usuario no tiene un rol válido"));
    }

    public List<UsuarioResumen> listarUsuarios() {
        return repository.findAllProjectedByOrderByUsernameAsc();
    }

    @Transactional
    public UsuarioResumen crearUsuario(String username, String clave, String nombreRol) {
        String normalizado = username.strip().toLowerCase(Locale.ROOT);
        if (normalizado.isBlank() || normalizado.codePointCount(0, normalizado.length()) > 50) {
            throw new ApiError(422, "USUARIO_INVALIDO", "El usuario debe tener entre 1 y 50 caracteres");
        }
        Rol rol = roles.findById(nombreRol)
                .orElseThrow(() -> new ApiError(422, "ROL_INVALIDO", "El rol indicado no existe"));
        UsuarioApi usuario = new UsuarioApi();
        usuario.setUsername(normalizado);
        usuario.setRol(rol.getNombre());
        usuario.setPassword(cifrarClave(clave));
        UsuarioApi creado = repository.saveAndFlush(usuario);
        return new UsuarioResumen(creado.getId(), creado.getUsername(), creado.getRol());
    }

    @Transactional
    public void restablecerClave(int id, String clave, String administrador) {
        if (id <= 0) {
            throw new ApiError(422, "USUARIO_INVALIDO", "El ID de usuario debe ser positivo");
        }
        if (repository.findResumenByUsername(administrador).filter(actual -> actual.id().equals(id)).isPresent()) {
            throw new ApiError(403, "SIN_PERMISO", "Solo puede restablecer la clave de otro usuario");
        }
        if (repository.cambiarClave(id, cifrarClave(clave)) == 0) {
            throw new ApiError(404, "USUARIO_NO_ENCONTRADO", "Usuario no encontrado");
        }
    }

    private String cifrarClave(String clave) {
        if (clave == null || clave.codePointCount(0, clave.length()) < 8
                || clave.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiError(422, "CLAVE_INVALIDA", "La clave requiere al menos 8 caracteres y admite hasta 72 bytes");
        }
        return passwordEncoder.encode(clave);
    }

    public List<Rol> listarRoles() {
        return roles.findAllByOrderByNombreAsc();
    }

    @Transactional
    public Rol crearRol(String nombre, String rolBase, String descripcion) {
        roles.insertar(nombre, descripcion, rolBase);
        return new Rol(nombre, descripcion, rolBase, false);
    }
}
