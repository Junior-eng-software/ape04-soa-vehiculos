namespace ConsultaVehiculosWinForms;

internal static class GatewayHttp
{
    public static HttpClient Cliente { get; } = new()
    {
        BaseAddress = new Uri("http://127.0.0.1:8090/"),
        Timeout = TimeSpan.FromSeconds(15)
    };
}
