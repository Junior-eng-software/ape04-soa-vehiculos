package ec.edu.uta.venta_vehiculos_api.controller;

import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.*;

import ec.edu.uta.venta_vehiculos_api.security.JwtService;

// Configura el comportamiento de Spring o el mapeo ORM.
@RestController
public class IdentidadController {
 // Configura el comportamiento de Spring o el mapeo ORM.
 @GetMapping("/api/identidad")
 // Declara un método o constructor público.
 public Map<String,Object> identidad(Authentication a) {
  // Devuelve el resultado del método.
  var autoridades = a.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
  return Map.of(
   "usuario", a.getName(),
   "roles", autoridades.stream().filter(x -> x.startsWith("ROLE_")).toList(),
   "permisos", autoridades.stream().filter(JwtService.PERMISO_CREAR_VENTA::equals).toList());
 }
}
