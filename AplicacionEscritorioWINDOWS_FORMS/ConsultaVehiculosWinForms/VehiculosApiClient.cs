using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ConsultaVehiculosWinForms;

internal sealed record CrearVehiculoRequest(
    string Marca, string Modelo, string Placa, string Chasis, int Anio, string? Color, decimal Precio);

internal sealed class VehiculosApiClient(HttpClient clienteHttp)
{
    private static readonly JsonSerializerOptions OpcionesJson = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public VehiculosApiClient() : this(GatewayHttp.Cliente)
    {
    }

    public async Task<List<Vehiculo>> ConsultarAsync(string token)
    {
        using var solicitud = new HttpRequestMessage(HttpMethod.Get, "api/vehiculos");
        solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using HttpResponseMessage respuesta = await clienteHttp.SendAsync(solicitud).ConfigureAwait(false);
        respuesta.EnsureSuccessStatusCode();

        return await respuesta.Content.ReadFromJsonAsync<List<Vehiculo>>(OpcionesJson)
            .ConfigureAwait(false) ?? new List<Vehiculo>();
    }

    public async Task<int> CrearAsync(string token, CrearVehiculoRequest datos)
    {
        using var solicitud = new HttpRequestMessage(HttpMethod.Post, "api/vehiculos");
        solicitud.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        solicitud.Content = JsonContent.Create(datos);

        using HttpResponseMessage respuesta = await clienteHttp.SendAsync(solicitud).ConfigureAwait(false);
        if (respuesta.StatusCode == HttpStatusCode.Conflict)
            throw await ConflictoRegistroException.DesdeRespuestaAsync(respuesta).ConfigureAwait(false);
        respuesta.EnsureSuccessStatusCode();
        if (respuesta.StatusCode != HttpStatusCode.Created)
            throw new HttpRequestException("HTTP inesperado al registrar.", null, respuesta.StatusCode);

        Vehiculo? vehiculo;
        try
        {
            vehiculo = await respuesta.Content.ReadFromJsonAsync<Vehiculo>(OpcionesJson).ConfigureAwait(false);
        }
        catch (JsonException ex)
        {
            throw new HttpRequestException("Respuesta de registro inválida.", ex, HttpStatusCode.Created);
        }

        if (vehiculo is null || vehiculo.IdVehiculo <= 0)
            throw new HttpRequestException("La respuesta no incluye el identificador.", null, HttpStatusCode.Created);

        return vehiculo.IdVehiculo;
    }
}
