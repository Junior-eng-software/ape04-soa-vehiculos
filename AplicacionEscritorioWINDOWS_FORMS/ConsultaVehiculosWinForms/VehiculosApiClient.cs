using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ConsultaVehiculosWinForms;

internal sealed class VehiculosApiClient(HttpClient clienteHttp)
{
    private static readonly HttpClient ClienteCompartido = new()
    {
        BaseAddress = new Uri("http://127.0.0.1:8090/"),
        Timeout = TimeSpan.FromSeconds(15)
    };

    private static readonly JsonSerializerOptions OpcionesJson = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public VehiculosApiClient() : this(ClienteCompartido)
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
}
