package ec.edu.uta.notificaciones.controller;

import ec.edu.uta.notificaciones.dto.AvisoVentaResponse;
import ec.edu.uta.notificaciones.dto.NotificacionRequest;
import ec.edu.uta.notificaciones.dto.NotificacionResponse;
import ec.edu.uta.notificaciones.security.IdentidadAdministrador;
import ec.edu.uta.notificaciones.service.HistorialNotificaciones;
import ec.edu.uta.notificaciones.service.NotificacionService;
import java.util.List;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/notificaciones")
public class NotificacionController {

    private final NotificacionService notificacionService;
    private final IdentidadAdministrador identidad;
    private final HistorialNotificaciones historial;

    public NotificacionController(NotificacionService notificacionService, IdentidadAdministrador identidad,
                                   HistorialNotificaciones historial) {
        this.notificacionService = notificacionService;
        this.identidad = identidad;
        this.historial = historial;
    }

    @GetMapping
    public ResponseEntity<List<AvisoVentaResponse>> listar(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String autorizacion) {
        identidad.exigirAdmin(autorizacion);
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(historial.listar());
        } catch (DataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    @PostMapping
    public ResponseEntity<NotificacionResponse> crear(
            @RequestBody NotificacionRequest request) {

        NotificacionResponse response =
                notificacionService.procesar(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }
}
