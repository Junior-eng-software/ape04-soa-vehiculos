// Paquete donde se encuentran los DTO de la aplicación.
package ec.edu.uta.venta_vehiculos_api.dto;

// Permite manejar precios con precisión decimal.
import java.math.BigDecimal;
import java.util.regex.Pattern;

// Importa las anotaciones para validar los datos recibidos.
import jakarta.validation.constraints.*;
import org.hibernate.validator.constraints.CodePointLength;

// Define un DTO que recibe los datos de un vehículo.
// record crea automáticamente el constructor y métodos de acceso.
public record VehiculoRequest(

    // La marca es obligatoria y no puede estar vacía.
    @NotBlank @CodePointLength(max = 50, message = "admite hasta 50 caracteres") String marca,

    // El modelo es obligatorio y no puede estar vacío.
    @NotBlank @CodePointLength(max = 50, message = "admite hasta 50 caracteres") String modelo,

    // La placa es obligatoria y no puede estar vacía.
    @NotBlank @CodePointLength(max = 10, message = "admite hasta 10 caracteres") String placa,

    // El chasis es obligatorio y debe tener exactamente 17 caracteres.
    @NotBlank @CodePointLength(min = 17, max = 17, message = "debe tener 17 caracteres") String chasis,

    // El año es obligatorio y no puede ser null.
    @NotNull Integer anio,

    // El color es opcional porque no tiene validación de obligatoriedad.
    @CodePointLength(max = 30, message = "admite hasta 30 caracteres") String color,

    // El precio es obligatorio: no puede ser null.
    // @Positive exige que sea mayor que cero.
    // @Digits permite hasta 10 dígitos enteros y 2 decimales.
    @NotNull @Positive @Digits(integer=10, fraction=2)
    BigDecimal precio

) {
    // El límite de inicio evita volver a evaluar un mismo tramo de espacios interiores.
    private static final Pattern ESPACIOS_EXTERIORES = Pattern.compile("(?U)^\\s++|(?<!\\s)\\s++\\z");

    public VehiculoRequest {
        marca = recortar(marca);
        modelo = recortar(modelo);
        placa = recortar(placa);
        chasis = recortar(chasis);
        color = recortar(color);
        if ("".equals(color)) {
            color = null;
        }
    }

    private static String recortar(String valor) {
        return valor == null ? null : ESPACIOS_EXTERIORES.matcher(valor).replaceAll("");
    }
}
