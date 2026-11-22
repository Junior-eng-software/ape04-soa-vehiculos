using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ConsultaVehiculosWinForms;

internal enum CampoCorreccion { Ninguno, Correo, Documento, Token }

internal sealed record ErrorRegistro(string Titulo, string Mensaje, string Accion = "Aceptar",
    CampoCorreccion Campo = CampoCorreccion.Ninguno)
{
    internal static ErrorRegistro Desde(Exception error, bool vehiculo)
    {
        var estado = (error as HttpRequestException)?.StatusCode;
        var codigo = (error as ConflictoRegistroException)?.Codigo;

        return (estado, vehiculo, codigo) switch
        {
            (HttpStatusCode.Conflict, false, "CORREO_DUPLICADO") => new("Correo ya registrado",
                "No se puede registrar el comprador porque el correo electrónico ingresado ya está en uso. Introduce otro correo electrónico para continuar.",
                "Corregir correo", CampoCorreccion.Correo),
            (HttpStatusCode.Conflict, false, "DOCUMENTO_DUPLICADO") => new("Documento ya registrado",
                "No se puede registrar el comprador porque el documento ingresado ya está registrado para este usuario. Introduce otro documento para continuar.",
                "Corregir documento", CampoCorreccion.Documento),
            (HttpStatusCode.Conflict, true, "CONFLICTO_DATOS") => new("Conflicto al registrar el vehículo",
                "El servicio detectó un conflicto con los datos. Comprueba si la placa o el chasis ya están registrados y revisa los demás campos."),
            (HttpStatusCode.Conflict, _, _) => new("Conflicto de registro",
                "El servicio rechazó el registro por un conflicto. Revisa los datos antes de volver a intentarlo."),
            (HttpStatusCode.Unauthorized, _, _) => new("Sesión no válida",
                "La sesión venció o el token dejó de ser válido. Introduce un JWT válido para continuar.",
                "Revisar sesión", CampoCorreccion.Token),
            (HttpStatusCode.Forbidden, _, _) => new("Permiso insuficiente",
                "Tu usuario no tiene permiso para realizar esta operación."),
            (HttpStatusCode.Created, _, _) => new("Registro confirmado sin identificador",
                "La API confirmó el registro, pero no devolvió un ID válido. Consulta el listado antes de volver a registrar."),
            (HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity, _, _) => new("Datos rechazados",
                "El servicio rechazó los datos ingresados. Revisa los campos antes de volver a registrar."),
            _ when error is FormatException => new("Formato de sesión inválido",
                "Revisa el formato del JWT antes de enviar el registro.", "Revisar sesión", CampoCorreccion.Token),
            _ when estado is >= HttpStatusCode.BadRequest and < HttpStatusCode.InternalServerError
                and not HttpStatusCode.RequestTimeout => new("Registro rechazado",
                "El servicio rechazó la solicitud. Revisa los datos antes de volver a registrar."),
            _ => new("Resultado de registro incierto",
                (error is OperationCanceledException || estado == HttpStatusCode.RequestTimeout
                    ? "Se agotó el tiempo de espera. "
                    : "No se pudo confirmar el resultado del envío. ")
                + "Actualiza el listado y verifica si el registro aparece antes de volver a intentarlo.")
        };
    }
}

internal sealed class ConflictoRegistroException(string? codigo)
    : HttpRequestException("Conflicto de registro.", null, HttpStatusCode.Conflict)
{
    internal string? Codigo { get; } = codigo;

    internal static async Task<ConflictoRegistroException> DesdeRespuestaAsync(HttpResponseMessage respuesta)
    {
        try
        {
            using var cuerpo = await respuesta.Content.ReadAsStreamAsync().ConfigureAwait(false);
            var problema = await JsonSerializer.DeserializeAsync<ProblemaRegistro>(cuerpo).ConfigureAwait(false);
            return new(problema?.Codigo);
        }
        catch (JsonException)
        {
            return new(null);
        }
    }

    private sealed record ProblemaRegistro([property: JsonPropertyName("codigo")] string? Codigo);
}
