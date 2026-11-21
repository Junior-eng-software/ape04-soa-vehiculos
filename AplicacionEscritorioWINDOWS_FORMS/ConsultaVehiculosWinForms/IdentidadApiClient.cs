using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ConsultaVehiculosWinForms;

internal sealed record IdentidadSesion(string Usuario, string[] Roles)
{
    public bool PuedeRegistrar => Roles.Contains("ROLE_ADMIN") || Roles.Contains("ROLE_OPERADOR");
}

internal sealed class IdentidadApiClient(HttpClient clienteHttp)
{
    public async Task<IdentidadSesion> ConsultarAsync(string token, CancellationToken cancelacion)
    {
        using var solicitud = new HttpRequestMessage(HttpMethod.Get, "api/identidad");
        solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var respuesta = await clienteHttp.SendAsync(solicitud, cancelacion).ConfigureAwait(false);
        respuesta.EnsureSuccessStatusCode();

        var identidad = await respuesta.Content.ReadFromJsonAsync<IdentidadSesion>(cancelacion)
            .ConfigureAwait(false);
        if (identidad is null || string.IsNullOrWhiteSpace(identidad.Usuario) ||
            identidad.Roles is not { Length: > 0 } || identidad.Roles.Any(string.IsNullOrWhiteSpace))
            throw new JsonException("La respuesta no contiene una identidad válida.");

        return identidad;
    }
}
