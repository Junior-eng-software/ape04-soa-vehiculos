using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ConsultaVehiculosWinForms;

internal sealed record CrearCompradorRequest(string Documento, string Nombre, string Correo);
internal sealed record CompradorResumen(int Id, string Nombre);

internal sealed class CompradoresApiClient(HttpClient clienteHttp)
{
    private const string RutaCompradores = "api/compradores";

    public CompradoresApiClient() : this(GatewayHttp.Cliente)
    {
    }

    public async Task<List<CompradorResumen>> ConsultarAsync(string token)
    {
        using var solicitud = new HttpRequestMessage(HttpMethod.Get, RutaCompradores);
        solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using HttpResponseMessage respuesta = await clienteHttp.SendAsync(solicitud).ConfigureAwait(false);
        respuesta.EnsureSuccessStatusCode();
        if (respuesta.StatusCode != HttpStatusCode.OK)
            throw new HttpRequestException("HTTP inesperado al consultar compradores.", null, respuesta.StatusCode);

        var compradores = await respuesta.Content.ReadFromJsonAsync<List<CompradorResumen>>().ConfigureAwait(false);
        if (compradores is null || compradores.Any(c => c is null || c.Id <= 0 || c.Nombre is null))
            throw new JsonException("La respuesta no contiene una lista de compradores válida.");

        return compradores;
    }

    public async Task<int> CrearAsync(string token, CrearCompradorRequest datos)
    {
        using var solicitud = new HttpRequestMessage(HttpMethod.Post, RutaCompradores);
        solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        solicitud.Content = JsonContent.Create(datos);

        using HttpResponseMessage respuesta = await clienteHttp.SendAsync(solicitud).ConfigureAwait(false);
        respuesta.EnsureSuccessStatusCode();
        if (respuesta.StatusCode != HttpStatusCode.Created)
            throw new HttpRequestException("HTTP inesperado al registrar.", null, respuesta.StatusCode);

        int id;
        try
        {
            var comprador = await respuesta.Content.ReadFromJsonAsync<CompradorCreado>().ConfigureAwait(false);
            id = comprador?.Id ?? 0;
        }
        catch (JsonException ex)
        {
            throw new HttpRequestException("Respuesta de registro inválida.", ex, HttpStatusCode.Created);
        }

        if (id <= 0)
            throw new HttpRequestException("La respuesta no incluye un ID válido.", null, HttpStatusCode.Created);

        return id;
    }

    private sealed record CompradorCreado(int Id);
}
