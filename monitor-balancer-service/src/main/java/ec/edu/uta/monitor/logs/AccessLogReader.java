package ec.edu.uta.monitor.logs;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.AccessDeniedException;
import java.nio.file.NoSuchFileException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

import ec.edu.uta.monitor.config.MonitorProperties;
import ec.edu.uta.monitor.exception.LogNoDisponibleException;
import ec.edu.uta.monitor.exception.LogInvalidoException;
import ec.edu.uta.monitor.model.RegistroAcceso;

/**
 * Lee el access_log desde la ruta CONFIGURABLE (monitor.logs.ruta) y devuelve solo
 * las solicitudes GET del listado de vehiculos en el archivo acumulado.
 * Solo lectura: nunca modifica ni trunca el archivo de NGINX.
 */
@Component
public class AccessLogReader {

    private final MonitorProperties props;
    private final AccessLogParser parser;

    public AccessLogReader(MonitorProperties props, AccessLogParser parser) {
        this.props = props;
        this.parser = parser;
    }

    /** Resultado de la lectura con contadores de conciliación. */
    public record Lectura(List<RegistroAcceso> registros, long lineasLeidas, long excluidasPorRuta, long invalidas) { }

    public Lectura leer() {
        Path ruta = Path.of(props.logs().ruta());
        List<RegistroAcceso> dentro = new ArrayList<>();
        long leidas = 0, excluidas = 0, invalidas = 0, validas = 0;
        try (BufferedReader br = abrir(ruta)) {
            String linea;
            while ((linea = br.readLine()) != null) {
                if (linea.isBlank()) {
                    continue;
                }
                leidas++;
                var reg = parser.parsear(linea);
                if (reg.isEmpty()) {
                    invalidas++;
                    continue;
                }
                RegistroAcceso r = reg.get();
                validas++;
                if (!"GET".equals(r.metodo()) || !"/api/vehiculos".equals(r.uri())) {
                    excluidas++;
                    continue;
                }
                dentro.add(r);
            }
        } catch (NoSuchFileException e) {
            throw new LogNoDisponibleException(ruta.toString(), "ARCHIVO_INEXISTENTE");
        } catch (AccessDeniedException | SecurityException e) {
            throw new LogNoDisponibleException(ruta.toString(), "ARCHIVO_INACCESIBLE");
        } catch (IOException e) {
            // Una lectura interrumpida no se publica como si hubiese llegado al EOF.
            throw new LogNoDisponibleException(ruta.toString(), "LECTURA_FALLIDA");
        }
        if (leidas > 0 && validas == 0) throw new LogInvalidoException(leidas, invalidas);
        return new Lectura(List.copyOf(dentro), leidas, excluidas, invalidas);
    }

    /** Punto de sustitución para simular permisos/errores sin tocar permisos del sistema. */
    protected BufferedReader abrir(Path ruta) throws IOException {
        return Files.newBufferedReader(ruta, StandardCharsets.UTF_8);
    }

}
