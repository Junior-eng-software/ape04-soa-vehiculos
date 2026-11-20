using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ConsultaVehiculosWinForms;

internal sealed record VentaResumen(
    [property: JsonRequired] int Id,
    [property: JsonRequired] int VehiculoId,
    [property: JsonRequired] int CompradorId,
    [property: JsonRequired] string Estado,
    [property: JsonRequired] string? PrecioAcordado,
    [property: JsonRequired] string? Moneda,
    [property: JsonRequired, JsonPropertyName("fechaUTC")] string FechaUtc);

internal sealed class VentasApiClient(HttpClient clienteHttp)
{
    public VentasApiClient() : this(GatewayHttp.Cliente)
    {
    }

    public async Task<List<VentaResumen>> ConsultarAsync(string token)
    {
        using var solicitud = new HttpRequestMessage(HttpMethod.Get, "api/ventas");
        solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using HttpResponseMessage respuesta = await clienteHttp.SendAsync(solicitud).ConfigureAwait(false);
        respuesta.EnsureSuccessStatusCode();
        if (respuesta.StatusCode != HttpStatusCode.OK)
            throw new HttpRequestException("HTTP inesperado al consultar ventas.", null, respuesta.StatusCode);

        var ventas = await respuesta.Content.ReadFromJsonAsync<List<VentaResumen>>().ConfigureAwait(false);
        if (ventas is null || ventas.Any(v => v is null || v.Estado is null || v.FechaUtc is null))
            throw new JsonException("La respuesta no contiene una lista de ventas válida.");

        return ventas;
    }
}
