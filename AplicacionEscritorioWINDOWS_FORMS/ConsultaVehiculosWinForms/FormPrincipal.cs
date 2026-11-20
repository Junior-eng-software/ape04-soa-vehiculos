using System.Net;
using System.Text.Json;

namespace ConsultaVehiculosWinForms;

public partial class FormPrincipal : Form
{
    private readonly VehiculosApiClient apiVehiculos = new();

    public FormPrincipal()
    {
        InitializeComponent();
    }

    // Este es el único botón de la ventana: llama a Spring Boot y llena la grilla.
    private async void btnConsultar_Click(object? sender, EventArgs e)
    {
        string token = txtToken.Text.Trim();


        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            token = token[7..].Trim();
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            MostrarEstado("Pegue primero el token JWT obtenido en Postman.", esError: true);
            txtToken.Focus();
            return;
        }

        btnConsultar.Enabled = false;
        MostrarEstado("Consultando API Java...");

        try
        {
            List<Vehiculo> lista = await apiVehiculos.ConsultarAsync(token);

            dgvVehiculos.DataSource = null;
            dgvVehiculos.DataSource = lista;
            lblTotal.Text = $"Total de vehículos: {lista.Count}";
            MostrarEstado(lista.Count == 0
                ? "HTTP 200: la API respondió, pero no hay vehículos registrados."
                : "HTTP 200: consulta realizada correctamente.");
        }
        catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode codigo)
        {
            LimpiarDatos();
            MostrarEstado(codigo switch
            {
                HttpStatusCode.Unauthorized => "HTTP 401: JWT inválido o vencido. Genere un token nuevo.",
                HttpStatusCode.Forbidden => "HTTP 403: el usuario no tiene permiso de consulta.",
                _ => $"Error HTTP {(int)codigo} al consultar Java."
            }, esError: true);
        }
        catch (HttpRequestException)
        {
            LimpiarDatos();
            MostrarEstado("No se pudo conectar. Compruebe NGINX en localhost:8090.", esError: true);
        }
        catch (TaskCanceledException)
        {
            LimpiarDatos();
            MostrarEstado("La API no respondió dentro de los 15 segundos.", esError: true);
        }
        catch (JsonException)
        {
            LimpiarDatos();
            MostrarEstado("La respuesta no tiene el JSON esperado de vehículos.", esError: true);
        }
        finally
        {
            btnConsultar.Enabled = true;
        }
    }

    private void LimpiarDatos()
    {
        dgvVehiculos.DataSource = null;
        lblTotal.Text = "Total de vehículos: 0";
    }

    private void MostrarEstado(string mensaje, bool esError = false)
    {
        lblEstado.ForeColor = esError ? Color.Firebrick : Color.FromArgb(50, 64, 76);
        lblEstado.Text = mensaje;
    }

    private void lblTitulo_Click(object sender, EventArgs e)
    {

    }
}
