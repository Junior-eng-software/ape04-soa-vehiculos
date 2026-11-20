using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ConsultaVehiculosWinForms;

public partial class FormPrincipal : Form
{
    private readonly VehiculosApiClient apiVehiculos = new();
    private readonly CompradoresApiClient apiCompradores = new();
    private readonly VentasApiClient apiVentas = new();

    public FormPrincipal()
    {
        InitializeComponent();
        txtToken.TextChanged += (_, _) =>
        {
            dgvCompradores.DataSource = null;
            dgvVentas.DataSource = null;
        };
    }

    private string ObtenerToken()
    {
        string token = txtToken.Text.Trim();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            token = token[7..].Trim();
        }

        if (token.Length == 0)
        {
            MostrarEstado("Pegue primero el token JWT obtenido en Postman.", esError: true);
            txtToken.Focus();
        }
        return token;
    }

    private async void btnConsultar_Click(object? sender, EventArgs e)
    {
        string token = ObtenerToken();
        if (token.Length == 0)
            return;

        pestanasCatalogo.SelectedIndex = 0;
        HabilitarAcciones(false);
        MostrarEstado("Consultando API Java...");

        try
        {
            int total = await CargarCatalogoAsync(token);
            MostrarEstado(total == 0
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
            HabilitarAcciones(true);
        }
    }

    private async void btnRegistrar_Click(object? sender, EventArgs e)
    {
        string token = ObtenerToken();
        if (token.Length == 0)
            return;

        string marca = txtMarca.Text.Trim(), modelo = txtModelo.Text.Trim(), placa = txtPlaca.Text.Trim();
        string chasis = txtChasis.Text.Trim(), color = txtColor.Text.Trim();
        if (marca.Length == 0 || modelo.Length == 0 || placa.Length == 0 || chasis.Length != 17)
        {
            MostrarEstado("Ingresa marca, modelo, placa y un chasis de 17 caracteres.", esError: true);
            return;
        }
        if (!int.TryParse(txtAnio.Text, out int anio))
        {
            MostrarEstado("Ingresa el año como número entero.", esError: true);
            return;
        }
        if (!decimal.TryParse(txtPrecio.Text.Trim(), NumberStyles.AllowDecimalPoint,
                CultureInfo.CurrentCulture, out decimal precio)
            || precio <= 0 || precio > 9999999999.99m || decimal.Round(precio, 2) != precio)
        {
            MostrarEstado("Ingresa un precio positivo de hasta 10 enteros y 2 decimales.", esError: true);
            return;
        }

        var datos = new CrearVehiculoRequest(marca, modelo, placa, chasis, anio,
            color.Length == 0 ? null : color, decimal.Round(precio, 2));
        HabilitarAcciones(false);
        MostrarEstado("Registrando vehículo...");

        try
        {
            int id = await apiVehiculos.CrearAsync(token, datos);
            string confirmado = $"HTTP 201: vehículo registrado con ID {id}.";
            foreach (TextBox campo in new[] { txtMarca, txtModelo, txtPlaca, txtChasis, txtAnio, txtColor, txtPrecio })
                campo.Clear();

            try
            {
                await CargarCatalogoAsync(token);
                MostrarEstado(confirmado);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
            {
                MostrarEstado($"{confirmado} No se pudo actualizar el catálogo.", esError: true);
            }
        }
        catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode codigo)
        {
            string mensaje = codigo switch
            {
                HttpStatusCode.BadRequest => "Solicitud inválida. Revisa los datos ingresados.",
                HttpStatusCode.Unauthorized => "JWT inválido o vencido. Genere un token nuevo.",
                HttpStatusCode.Forbidden => "El usuario no tiene permiso para registrar vehículos.",
                HttpStatusCode.Conflict => "Los datos entran en conflicto con un vehículo existente.",
                HttpStatusCode.UnprocessableEntity => "Uno o más datos no cumplen la validación de la API.",
                HttpStatusCode.Created => "La respuesta no contiene un ID válido. Consulta el catálogo antes de reintentar.",
                _ => "Respuesta inesperada. Consulta el catálogo antes de reintentar."
            };
            MostrarEstado($"HTTP {(int)codigo}: {mensaje}", esError: true);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            string mensaje = ex is TaskCanceledException ? "Se agotó el tiempo de espera." : "Se interrumpió la conexión con NGINX.";
            MostrarEstado($"{mensaje} Consulta el catálogo antes de reintentar.", esError: true);
        }
        finally
        {
            HabilitarAcciones(true);
        }
    }

    private async void btnRegistrarComprador_Click(object? sender, EventArgs e)
    {
        string token = ObtenerToken();
        if (token.Length == 0)
            return;

        string documento = txtDocumentoComprador.Text.Trim();
        string nombre = txtNombreComprador.Text.Trim();
        string correo = txtCorreoComprador.Text.Trim();
        if (documento.Length < 3 || nombre.Length < 2
            || correo.Length < 5 || !Regex.IsMatch(correo, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
        {
            MostrarEstado("Ingresa un documento de al menos 3 caracteres, un nombre y un correo válido.", esError: true);
            return;
        }

        HabilitarAcciones(false);
        MostrarEstado("Registrando comprador...");
        try
        {
            var datos = new CrearCompradorRequest(documento, nombre, correo);
            int id = await apiCompradores.CrearAsync(token, datos);
            txtDocumentoComprador.Clear();
            txtNombreComprador.Clear();
            txtCorreoComprador.Clear();
            MostrarEstado($"HTTP 201: comprador registrado con ID {id}.");
        }
        catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode codigo)
        {
            string mensaje = codigo switch
            {
                HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity => "Revisa el documento, el nombre y el correo.",
                HttpStatusCode.Unauthorized => "JWT inválido o vencido. Genere un token nuevo.",
                HttpStatusCode.Forbidden => "Se requiere el rol OPERADOR o ADMIN para registrar compradores.",
                HttpStatusCode.Conflict => "El documento ya está registrado para este usuario.",
                HttpStatusCode.Created => "La API confirmó el alta, pero el ID no está disponible.",
                _ => "Respuesta inesperada. Verifica el resultado antes de reintentar."
            };
            MostrarEstado($"HTTP {(int)codigo}: {mensaje}", esError: true);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            string mensaje = ex is TaskCanceledException ? "Se agotó el tiempo de espera." : "Se interrumpió la conexión con NGINX.";
            MostrarEstado($"{mensaje} Verifica el resultado antes de reintentar.", esError: true);
        }
        finally
        {
            HabilitarAcciones(true);
        }
    }

    private async void btnConsultarCompradores_Click(object? sender, EventArgs e) =>
        await ConsultarListadoAsync(apiCompradores.ConsultarAsync, dgvCompradores, "compradores");

    private async void btnConsultarVentas_Click(object? sender, EventArgs e) =>
        await ConsultarListadoAsync(apiVentas.ConsultarAsync, dgvVentas, "ventas");

    private async Task ConsultarListadoAsync<T>(
        Func<string, Task<List<T>>> consultar, DataGridView grilla, string recurso)
    {
        string token = ObtenerToken();
        if (token.Length == 0)
            return;

        grilla.DataSource = null;
        HabilitarAcciones(false);
        txtToken.Enabled = false;
        MostrarEstado($"Consultando {recurso}...");
        try
        {
            List<T> registros = await consultar(token);
            grilla.DataSource = registros;
            MostrarEstado(registros.Count == 0
                ? $"HTTP 200: no hay {recurso} visibles."
                : $"HTTP 200: {registros.Count} {recurso} visibles.");
        }
        catch (HttpRequestException ex) when (ex.StatusCode is HttpStatusCode codigo)
        {
            string mensaje = codigo switch
            {
                HttpStatusCode.Unauthorized => "JWT inválido o vencido. Genere un token nuevo.",
                HttpStatusCode.Forbidden => $"El usuario no tiene permiso para consultar {recurso}.",
                _ => $"Respuesta inesperada al consultar {recurso}."
            };
            MostrarEstado($"HTTP {(int)codigo}: {mensaje}", esError: true);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            string mensaje = ex switch
            {
                TaskCanceledException => "La API no respondió dentro de los 15 segundos.",
                JsonException => $"La respuesta no tiene el JSON esperado de {recurso}.",
                _ => "No se pudo conectar. Compruebe NGINX en localhost:8090."
            };
            MostrarEstado(mensaje, esError: true);
        }
        finally
        {
            txtToken.Enabled = true;
            HabilitarAcciones(true);
        }
    }

    private async Task<int> CargarCatalogoAsync(string token)
    {
        List<Vehiculo> lista = await apiVehiculos.ConsultarAsync(token);
        dgvVehiculos.DataSource = null;
        dgvVehiculos.DataSource = lista;
        lblTotal.Text = $"Total de vehículos: {lista.Count}";
        pestanasCatalogo.SelectedIndex = 0;
        return lista.Count;
    }

    private void HabilitarAcciones(bool habilitadas)
    {
        btnConsultar.Enabled = habilitadas;
        btnRegistrar.Enabled = habilitadas;
        btnRegistrarComprador.Enabled = habilitadas;
        btnConsultarCompradores.Enabled = habilitadas;
        btnConsultarVentas.Enabled = habilitadas;
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
