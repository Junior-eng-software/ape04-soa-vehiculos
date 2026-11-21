namespace ConsultaVehiculosWinForms;

public partial class FormPrincipal
{
    private const string TodasMarcas = "Todas las marcas";
    private const string TodosModelos = "Todos los modelos";
    private const string TodosEstados = "Todos los estados";
    private ComboBox filtroMarca = null!;
    private ComboBox filtroModelo = null!;
    private ComboBox filtroEstado = null!;
    private Button limpiarFiltros = null!;
    private bool reconstruyendoFiltros;

    private TableLayoutPanel CrearBarraFiltros()
    {
        var barra = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 4, RowCount = 2, Margin = new Padding(0)
        };
        for (int i = 0; i < 3; i++)
            barra.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / 3));
        barra.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        barra.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        barra.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        filtroMarca = AgregarCampo(barra, "Marca", 0, 0, new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList });
        filtroModelo = AgregarCampo(barra, "Modelo", 1, 0, new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList });
        filtroEstado = AgregarCampo(barra, "Estado", 2, 0, new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList });
        limpiarFiltros = CrearBoton("Limpiar filtros", nameof(limpiarFiltros));
        barra.Controls.Add(limpiarFiltros, 3, 1);
        return barra;
    }

    private void ConfigurarFiltros()
    {
        ReconstruirFiltros();
        filtroMarca.SelectedIndexChanged += (_, _) => CambiarFiltros(reconstruir: true);
        filtroModelo.SelectedIndexChanged += (_, _) => CambiarFiltros();
        filtroEstado.SelectedIndexChanged += (_, _) => CambiarFiltros();
        limpiarFiltros.Click += (_, _) => LimpiarFiltros();
    }

    private void LimpiarFiltros()
    {
        ReconstruirFiltros(conservar: false);
        CambiarFiltros();
    }

    private void ReconstruirFiltros(bool conservar = true)
    {
        reconstruyendoFiltros = true;
        try
        {
            var catalogo = catalogoRegistro ?? [];
            CargarOpciones(filtroMarca, TodasMarcas, Opciones(catalogo.Select(v => v.Marca)), conservar);
            var porMarca = FiltrarVehiculos(catalogo, Seleccion(filtroMarca), null, null);
            CargarOpciones(filtroModelo, TodosModelos, Opciones(porMarca.Select(v => v.Modelo)), conservar);
            CargarOpciones(filtroEstado, TodosEstados, Opciones(catalogo.Select(v => v.Estado)), conservar);
        }
        finally
        {
            reconstruyendoFiltros = false;
        }
    }

    private static void CargarOpciones(ComboBox selector, string inicial, string[] opciones, bool conservar)
    {
        string? actual = conservar ? Seleccion(selector) : null;
        int indice = Array.FindIndex(opciones, opcion => ComparadorCatalogo.Equals(opcion, actual));
        selector.BeginUpdate();
        try
        {
            selector.Items.Clear();
            selector.Items.Add(inicial);
            selector.Items.AddRange(opciones);
            selector.SelectedIndex = indice + 1;
        }
        finally
        {
            selector.EndUpdate();
        }
    }

    private static string? Seleccion(ComboBox selector) => selector.SelectedIndex > 0 ? (string?)selector.SelectedItem : null;

    private void CambiarFiltros(bool reconstruir = false)
    {
        if (reconstruyendoFiltros || catalogoRegistro is null || identidad is null || Vehiculos.Cargando || Vehiculos.Registrando)
            return;
        if (reconstruir)
            ReconstruirFiltros();
        AplicarFiltros();
        if (Vehiculos.Error)
            MostrarVistaActiva();
        else
            Informar(Vehiculos, MensajeCatalogo());
    }

    private void AplicarFiltros()
    {
        var visibles = FiltrarVehiculos(catalogoRegistro ?? [], Seleccion(filtroMarca), Seleccion(filtroModelo), Seleccion(filtroEstado));
        dgvVehiculos.DataSource = visibles;
        Vehiculos.Total = visibles.Count;
    }

    private string MensajeCatalogo() => catalogoRegistro is { Count: 0 } ? "El catálogo no tiene vehículos."
        : Vehiculos.Total == 0 ? "Ningún vehículo coincide con los filtros." : "Catálogo actualizado.";

    private void HabilitarFiltros()
    {
        bool habilitar = identidad is not null && catalogoRegistro is { Count: > 0 } && !Vehiculos.Cargando && !Vehiculos.Registrando;
        filtroMarca.Enabled = filtroModelo.Enabled = filtroEstado.Enabled = limpiarFiltros.Enabled = habilitar;
    }

    internal static List<Vehiculo> FiltrarVehiculos(IEnumerable<Vehiculo> catalogo, string? marca, string? modelo, string? estado) =>
        catalogo.Where(v => Coincide(v.Marca, marca) && Coincide(v.Modelo, modelo) && Coincide(v.Estado, estado)).ToList();

    private static bool Coincide(string? valor, string? filtro) =>
        string.IsNullOrWhiteSpace(filtro) || ComparadorCatalogo.Equals(valor?.Trim(), filtro.Trim());
}
