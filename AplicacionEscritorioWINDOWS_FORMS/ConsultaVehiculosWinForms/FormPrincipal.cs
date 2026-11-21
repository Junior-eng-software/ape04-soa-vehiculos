using System.Collections;
using System.Globalization;
using System.Net;
using System.Text.Json;

namespace ConsultaVehiculosWinForms;

public partial class FormPrincipal : Form
{
    private readonly IdentidadApiClient apiIdentidad;
    private readonly VehiculosApiClient apiVehiculos;
    private readonly CompradoresApiClient apiCompradores;
    private readonly System.Windows.Forms.Timer esperaIdentidad = new() { Interval = 500 };
    private readonly Vista[] vistas;
    private Vista Vehiculos => vistas[0];
    private Vista Compradores => vistas[1];
    private Vista? Activa => pestanasCatalogo.SelectedIndex < 0 ? null : vistas[pestanasCatalogo.SelectedIndex];
    private CancellationTokenSource? consultaIdentidad;
    private IdentidadSesion? identidad;
    private string tokenEscrito = "";
    private HttpStatusCode? codigoSesion;
    private int versionSesion;
    private bool cerrado;

    private static readonly CultureInfo Ecuador = CultureInfo.GetCultureInfo("es-EC");

    public FormPrincipal() : this(GatewayHttp.Cliente) { }

    internal FormPrincipal(HttpClient cliente)
    {
        apiIdentidad = new(cliente);
        apiVehiculos = new(cliente);
        apiCompradores = new(cliente);
        var apiVentas = new VentasApiClient(cliente);
        InitializeComponent();

        vistas =
        [
            new(dgvVehiculos, btnConsultar, async token => await apiVehiculos.ConsultarAsync(token)),
            new(dgvCompradores, btnConsultarCompradores, async token => await apiCompradores.ConsultarAsync(token)),
            new(dgvVentas, btnConsultarVentas, async token => await apiVentas.ConsultarAsync(token))
        ];
        txtToken.TextChanged += CambiarToken;
        txtToken.KeyDown += VerificarConEnter;
        esperaIdentidad.Tick += async (_, _) => await VerificarIdentidadAsync();
        pestanasCatalogo.SelectedIndexChanged += async (_, _) =>
        {
            MostrarVistaActiva();
            await CargarVistaActivaAsync();
        };
        foreach (Vista vista in vistas)
            vista.Actualizar.Click += async (_, _) => await CargarAsync(vista);
        ConfigurarRegistro();
        ActualizarAcciones();
    }

    private void CambiarToken(object? sender, EventArgs e)
    {
        string token = txtToken.Text.Trim();
        if (token.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            token = token[7..].Trim();
        if (token == tokenEscrito)
            return;

        tokenEscrito = token;
        esperaIdentidad.Stop();
        consultaIdentidad?.Cancel();
        InvalidarSesion(token.Length == 0 ? "Sin sesión" : "Verificando sesión…");
        if (token.Length > 0)
            esperaIdentidad.Start();
    }

    private async void VerificarConEnter(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Enter)
            return;
        e.SuppressKeyPress = true;
        await VerificarIdentidadAsync();
    }

    private async Task VerificarIdentidadAsync()
    {
        esperaIdentidad.Stop();
        if (cerrado || tokenEscrito.Length == 0 || identidad is not null || codigoSesion == HttpStatusCode.Unauthorized ||
            consultaIdentidad is { IsCancellationRequested: false })
            return;

        int version = versionSesion;
        using var solicitud = new CancellationTokenSource();
        consultaIdentidad = solicitud;
        MostrarSesion("Verificando sesión…");
        try
        {
            IdentidadSesion actual = await apiIdentidad.ConsultarAsync(tokenEscrito, solicitud.Token);
            if (!EsVersionActual(version))
                return;

            identidad = actual;
            string roles = string.Join(", ", actual.Roles.Select(rol =>
                rol.StartsWith("ROLE_", StringComparison.Ordinal) ? rol[5..] : rol));
            MostrarSesion($"{actual.Usuario} · {roles} · Sesión verificada");
            await CargarVistaActivaAsync();
        }
        catch (Exception ex) when (EsFalloHttp(ex))
        {
            if (EsVersionActual(version))
            {
                var codigo = (ex as HttpRequestException)?.StatusCode;
                MostrarSesion(MensajeError(ex, "No se pudo verificar la sesión."), codigo, error: true);
            }
        }
        finally
        {
            if (ReferenceEquals(consultaIdentidad, solicitud))
                consultaIdentidad = null;
        }
    }

    private void InvalidarSesion(string mensaje, HttpStatusCode? codigo = null)
    {
        versionSesion++;
        identidad = null;
        ActualizarCatalogoRegistro(null);
        foreach (Vista vista in vistas)
        {
            vista.Grilla.DataSource = null;
            vista.Consultada = false;
            vista.Total = null;
            vista.UltimaActualizacion = null;
            vista.Mensaje = "Introduce un JWT válido para consultar.";
            vista.Codigo = null;
            vista.Error = false;
        }
        MostrarSesion(mensaje, codigo, error: codigo is not null);
    }

    private void MostrarSesion(string mensaje, HttpStatusCode? codigo = null, bool error = false)
    {
        codigoSesion = codigo;
        lblSesion.Text = mensaje;
        lblSesion.ForeColor = error ? Color.Firebrick : TextoSecundario;
        ActualizarAcciones();
        MostrarVistaActiva();
    }

    private Task CargarVistaActivaAsync() =>
        Activa is { Consultada: false } vista ? CargarAsync(vista) : Task.CompletedTask;

    private async Task CargarAsync(Vista vista, string? confirmacion = null)
    {
        if (identidad is null || vista.Cargando || (vista.Registrando && confirmacion is null))
            return;

        int version = versionSesion;
        vista.Consultada = true;
        vista.Cargando = true;
        Informar(vista, confirmacion is null ? "Cargando registros…" : $"{confirmacion} Actualizando listado…",
            confirmacion is null ? null : HttpStatusCode.Created);

        try
        {
            IList registros = await vista.Consultar(tokenEscrito);
            if (!EsVersionActual(version))
                return;

            vista.Grilla.DataSource = registros;
            if (vista == Vehiculos)
                ActualizarCatalogoRegistro((IReadOnlyList<Vehiculo>)registros);
            vista.Total = registros.Count;
            vista.UltimaActualizacion = DateTime.Now;
            Informar(vista, confirmacion ?? (registros.Count == 0 ? "No hay registros disponibles." : "Listado actualizado."),
                confirmacion is null ? HttpStatusCode.OK : HttpStatusCode.Created);
        }
        catch (Exception ex) when (EsFalloHttp(ex))
        {
            if (EsVersionActual(version))
            {
                var codigo = (ex as HttpRequestException)?.StatusCode;
                if (codigo == HttpStatusCode.Unauthorized)
                    InvalidarSesion(confirmacion is null ? "JWT inválido o vencido." : $"{confirmacion} La sesión venció.", codigo);
                else
                {
                    if (codigo == HttpStatusCode.Forbidden)
                    {
                        vista.Grilla.DataSource = null;
                        if (vista == Vehiculos)
                            ActualizarCatalogoRegistro(null);
                        vista.Total = null;
                        vista.UltimaActualizacion = null;
                    }
                    string mensaje = MensajeError(ex, "No se pudo actualizar el listado.");
                    Informar(vista, confirmacion is null ? mensaje : $"{confirmacion} {mensaje}", codigo, error: true);
                }
            }
        }
        finally
        {
            vista.Cargando = false;
            await AlTerminarAsync(vista, version);
        }
    }

    private async void btnRegistrar_Click(object? sender, EventArgs e)
    {
        if (!PuedeRegistrar(Vehiculos))
            return;
        ConfirmarMarca(cmbMarca.Text);
        if (!ValidarFormulario(Vehiculos, camposVehiculo))
            return;

        int anio = int.Parse(txtAnio.Text.Trim(), CultureInfo.InvariantCulture);
        LeerPrecio(txtPrecio.Text.Trim(), out decimal precio);
        string color = txtColor.Text.Trim();
        var datos = new CrearVehiculoRequest(cmbMarca.Text, cmbModelo.Text, txtPlaca.Text.Trim(), txtChasis.Text.Trim(),
            anio, color.Length == 0 ? null : color, precio);
        await RegistrarAsync(Vehiculos, token => apiVehiculos.CrearAsync(token, datos), "vehículo", camposVehiculo);
    }

    private async void btnRegistrarComprador_Click(object? sender, EventArgs e)
    {
        if (!PuedeRegistrar(Compradores) || !ValidarFormulario(Compradores, camposComprador))
            return;

        var datos = new CrearCompradorRequest(txtDocumentoComprador.Text.Trim(), txtNombreComprador.Text.Trim(),
            txtCorreoComprador.Text.Trim());
        await RegistrarAsync(Compradores, token => apiCompradores.CrearAsync(token, datos), "comprador", camposComprador);
    }

    private async Task RegistrarAsync(Vista vista, Func<string, Task<int>> crear, string recurso, Control[] campos)
    {
        int version = versionSesion;
        vista.Registrando = true;
        foreach (Control campo in campos)
            campo.Enabled = false;
        Informar(vista, $"Registrando {recurso}…");

        try
        {
            int id = await crear(tokenEscrito);
            if (!cerrado)
            {
                foreach (Control campo in campos)
                {
                    campo.Text = "";
                    erroresRegistro.SetError(campo, "");
                }
                if (vista == Vehiculos)
                {
                    marcaConfirmada = "";
                    ActualizarOpciones(cmbModelo, []);
                }
            }
            if (EsVersionActual(version))
                await CargarAsync(vista, $"Se registró el {recurso} con ID {id}.");
        }
        catch (Exception ex) when (EsFalloHttp(ex))
        {
            if (EsVersionActual(version))
            {
                var codigo = (ex as HttpRequestException)?.StatusCode;
                if (codigo == HttpStatusCode.Unauthorized)
                    InvalidarSesion("JWT inválido o vencido. Introduce un token nuevo.", codigo);
                else
                {
                    string mensaje = codigo switch
                    {
                        HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity => "Revisa los datos ingresados.",
                        HttpStatusCode.Conflict => vista == Vehiculos
                            ? "La placa o el chasis ya está registrado."
                            : "El documento ya está registrado para este usuario.",
                        HttpStatusCode.Created => "La API confirmó el alta sin un ID válido. Consulta el listado antes de reintentar.",
                        HttpStatusCode.Forbidden => "El usuario no tiene permiso de registro.",
                        _ => MensajeError(ex, "No se pudo confirmar el registro.") + " Consulta el listado antes de reintentar."
                    };
                    Informar(vista, mensaje, codigo, error: true);
                }
            }
        }
        finally
        {
            vista.Registrando = false;
            if (!cerrado)
                foreach (Control campo in campos)
                    campo.Enabled = true;
            await AlTerminarAsync(vista, version);
        }
    }

    private async Task AlTerminarAsync(Vista vista, int version)
    {
        if (cerrado)
            return;
        ActualizarAcciones();
        if (version != versionSesion && vista == Activa)
            await CargarVistaActivaAsync();
    }

    private bool EsVersionActual(int version) => !cerrado && version == versionSesion;

    private void ActualizarAcciones()
    {
        foreach (Vista vista in vistas)
            vista.Actualizar.Enabled = identidad is not null && !vista.Cargando && !vista.Registrando;

        btnRegistrar.Enabled = PuedeRegistrar(Vehiculos);
        btnRegistrarComprador.Enabled = PuedeRegistrar(Compradores);
        ActualizarAyudaRegistro();
    }

    private bool PuedeRegistrar(Vista vista) =>
        identidad is { PuedeRegistrar: true } && !vista.Cargando && !vista.Registrando;

    private void Informar(Vista vista, string mensaje, HttpStatusCode? codigo = null, bool error = false)
    {
        vista.Mensaje = mensaje;
        vista.Codigo = codigo;
        vista.Error = error;
        ActualizarAcciones();
        MostrarVistaActiva();
    }

    private void MostrarVistaActiva()
    {
        Vista? vista = Activa;
        if (vista is null)
            return;

        lblEstado.Text = vista.Mensaje;
        lblEstado.ForeColor = vista.Error ? Color.Firebrick : TextoSecundario;
        HttpStatusCode? codigo = vista.Codigo ?? codigoSesion;
        lblHttp.Text = codigo is null ? "" : $"HTTP {(int)codigo.Value}";
        lblTotal.Text = vista.Total is int total ? $"Total: {total}" : "Total: —";
        lblActualizacion.Text = vista.UltimaActualizacion is DateTime fecha
            ? $"Actualizado: {fecha.ToString("HH:mm:ss", Ecuador)}" : "Actualizado: —";
    }

    private static bool EsFalloHttp(Exception ex) =>
        ex is HttpRequestException or OperationCanceledException or JsonException or FormatException;

    private static string MensajeError(Exception ex, string predeterminado) => ex switch
    {
        HttpRequestException { StatusCode: HttpStatusCode.Unauthorized } => "JWT inválido o vencido. Introduce un token nuevo.",
        HttpRequestException { StatusCode: HttpStatusCode.Forbidden } => "El usuario no tiene permiso de consulta.",
        HttpRequestException { StatusCode: null } => "No se pudo conectar con NGINX.",
        OperationCanceledException => "Se agotó el tiempo de espera.",
        JsonException => "La API devolvió datos inesperados.",
        FormatException => "El formato del JWT no es válido.",
        _ => predeterminado
    };

    private void FormatearCelda(object? sender, DataGridViewCellFormattingEventArgs e)
    {
        var grilla = (DataGridView)sender!;
        string propiedad = grilla.Columns[e.ColumnIndex].DataPropertyName;
        if (propiedad == nameof(Vehiculo.Precio) && e.Value is decimal precio)
            e.Value = FormatearImporte(precio, "USD");
        else if (propiedad == nameof(VentaResumen.PrecioAcordado) && grilla.Rows[e.RowIndex].DataBoundItem is VentaResumen venta)
            e.Value = decimal.TryParse(venta.PrecioAcordado, NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
                CultureInfo.InvariantCulture, out decimal acordado) ? FormatearImporte(acordado, venta.Moneda) : "—";
        else if (propiedad == nameof(Vehiculo.Chasis) && e.Value is string { Length: > 12 } chasis)
            e.Value = $"{chasis[..8]}…{chasis[^3..]}";
        else
            return;

        e.FormattingApplied = true;
    }

    private static string FormatearImporte(decimal importe, string? moneda)
    {
        string cantidad = importe.ToString("#,##0.00", Ecuador);
        return string.IsNullOrWhiteSpace(moneda) ? cantidad : $"{moneda} {cantidad}";
    }

    private sealed class Vista(DataGridView grilla, Button actualizar, Func<string, Task<IList>> consultar)
    {
        public DataGridView Grilla { get; } = grilla;
        public Button Actualizar { get; } = actualizar;
        public Func<string, Task<IList>> Consultar { get; } = consultar;
        public bool Cargando { get; set; }
        public bool Consultada { get; set; }
        public bool Registrando { get; set; }
        public string Mensaje { get; set; } = "Introduce un JWT válido para consultar.";
        public HttpStatusCode? Codigo { get; set; }
        public bool Error { get; set; }
        public int? Total { get; set; }
        public DateTime? UltimaActualizacion { get; set; }
    }
}
