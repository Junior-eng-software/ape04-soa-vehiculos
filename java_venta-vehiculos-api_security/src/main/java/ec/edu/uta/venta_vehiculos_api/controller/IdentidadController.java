package ec.edu.uta.venta_vehiculos_api.controller;

import java.util.List;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import ec.edu.uta.venta_vehiculos_api.security.JwtService;
import ec.edu.uta.venta_vehiculos_api.service.UsuarioApiService;

// Configura el comportamiento de Spring o el mapeo ORM.
@RestController
public class IdentidadController {
 private final UsuarioApiService usuarios;

 public IdentidadController(UsuarioApiService usuarios) {
  this.usuarios = usuarios;
 }

 // Configura el comportamiento de Spring o el mapeo ORM.
 @GetMapping("/api/identidad")
 // Declara un método o constructor público.
 public Map<String,Object> identidad(Authentication a) {
  var rol = usuarios.rolDeUsuario(a.getName());
  boolean puedeVender = !"CONSULTA".equals(rol.getRolBase()) && a.getAuthorities().stream()
   .anyMatch(autoridad -> JwtService.PERMISO_CREAR_VENTA.equals(autoridad.getAuthority()));
  return Map.of(
   "usuario", a.getName(),
   "roles", List.of("ROLE_" + rol.getRolBase()),
   "rolNombre", rol.getNombre(),
   "permisos", puedeVender ? List.of(JwtService.PERMISO_CREAR_VENTA) : List.of());
 }
}
