#nullable enable

namespace ConsultaVehiculosWinForms;

partial class FormPrincipal
{
    private System.ComponentModel.IContainer? components;
    private static readonly Color TextoPrincipal = Color.FromArgb(31, 41, 55);
    private static readonly Color TextoSecundario = Color.FromArgb(50, 64, 76);
    private static readonly Color Fondo = Color.FromArgb(245, 247, 250);
    private static readonly Color Borde = Color.FromArgb(217, 223, 230);

    private TextBox txtToken = null!;
    private Label lblSesion = null!;
    private Label lblEstado = null!;
    private Label lblHttp = null!;
    private Label lblTotal = null!;
    private Label lblActualizacion = null!;
    private TabControl pestanasCatalogo = null!;
    private DataGridView dgvVehiculos = null!;
    private DataGridView dgvCompradores = null!;
    private DataGridView dgvVentas = null!;
    private Button btnConsultar = null!;
    private Button btnConsultarCompradores = null!;
    private Button btnConsultarVentas = null!;
    private Button btnRegistrar = null!;
    private Button btnRegistrarComprador = null!;
    private ComboBox cmbMarca = null!;
    private ComboBox cmbModelo = null!;
    private ErrorProvider erroresRegistro = null!;
    private Label lblAyudaVehiculo = null!;
    private Label lblAyudaComprador = null!;
    private TextBox txtPlaca = null!;
    private TextBox txtChasis = null!;
    private TextBox txtAnio = null!;
    private TextBox txtColor = null!;
    private TextBox txtPrecio = null!;
    private TextBox txtDocumentoComprador = null!;
    private TextBox txtNombreComprador = null!;
    private TextBox txtCorreoComprador = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && !cerrado)
        {
            cerrado = true;
            tokenEscrito = "";
            consultaIdentidad?.Cancel();
            esperaIdentidad.Dispose();
            components?.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        SuspendLayout();
        components = new System.ComponentModel.Container();
        erroresRegistro = new ErrorProvider(components) { ContainerControl = this, BlinkStyle = ErrorBlinkStyle.NeverBlink };
        Font = new Font("Segoe UI", 10F);
        AutoScaleDimensions = new SizeF(7F, 19F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Fondo;
        ForeColor = TextoPrincipal;
        ClientSize = new Size(1080, 720);
        MinimumSize = new Size(840, 560);
        Name = "FormPrincipal";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Gestión automotriz";

        var estructura = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4, Padding = new Padding(18, 14, 18, 10)
        };
        estructura.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        estructura.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        estructura.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        estructura.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        estructura.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var titulo = new Label
        {
            Text = "Gestión automotriz", AutoSize = true,
            Font = new Font("Segoe UI", 22F, FontStyle.Bold), Margin = new Padding(0, 0, 0, 9)
        };
        pestanasCatalogo = CrearPestanasCatalogo();
        estructura.Controls.Add(titulo, 0, 0);
        estructura.Controls.Add(CrearBarraSesion(), 0, 1);
        estructura.Controls.Add(pestanasCatalogo, 0, 2);
        estructura.Controls.Add(CrearBarraEstado(), 0, 3);
        Controls.Add(estructura);
        ResumeLayout(true);
    }

    private TableLayoutPanel CrearBarraSesion()
    {
        var barra = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 3, RowCount = 1,
            BackColor = Color.White, Padding = new Padding(10, 5, 10, 5), Margin = new Padding(0, 0, 0, 10)
        };
        barra.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        barra.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 48));
        barra.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 52));
        var etiqueta = new Label { Text = "JWT", AutoSize = true, Anchor = AnchorStyles.Left };
        txtToken = new TextBox
        {
            Name = nameof(txtToken), AccessibleName = "Token JWT",
            Anchor = AnchorStyles.Left | AnchorStyles.Right, UseSystemPasswordChar = true,
            PlaceholderText = "Pega tu token de acceso"
        };
        lblSesion = new Label
        {
            Text = "Sin sesión", Dock = DockStyle.Fill, AutoEllipsis = true,
            ForeColor = TextoSecundario, TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(12, 0, 0, 0)
        };
        barra.Controls.Add(etiqueta, 0, 0);
        barra.Controls.Add(txtToken, 1, 0);
        barra.Controls.Add(lblSesion, 2, 0);
        return barra;
    }

    private TableLayoutPanel CrearBarraEstado()
    {
        var barra = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 4, RowCount = 1,
            BackColor = Color.White, Padding = new Padding(10, 6, 10, 6), Margin = new Padding(0, 8, 0, 0)
        };
        barra.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (int i = 0; i < 3; i++)
            barra.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        lblEstado = new Label
        {
            Text = "Introduce un JWT válido para consultar.", Dock = DockStyle.Fill,
            ForeColor = TextoSecundario, AutoEllipsis = true, TextAlign = ContentAlignment.MiddleLeft
        };
        lblHttp = DetalleEstado("");
        lblTotal = DetalleEstado("Total: —");
        lblActualizacion = DetalleEstado("Actualizado: —");
        barra.Controls.Add(lblEstado, 0, 0);
        barra.Controls.Add(lblHttp, 1, 0);
        barra.Controls.Add(lblTotal, 2, 0);
        barra.Controls.Add(lblActualizacion, 3, 0);
        var ayudas = new ToolTip(components!);
        lblEstado.TextChanged += (_, _) => ayudas.SetToolTip(lblEstado, lblEstado.Text);
        lblSesion.TextChanged += (_, _) => ayudas.SetToolTip(lblSesion, lblSesion.Text);
        return barra;
    }

    private static Label DetalleEstado(string texto) => new()
    {
        Text = texto, AutoSize = true, Anchor = AnchorStyles.Left,
        ForeColor = TextoSecundario, Margin = new Padding(10, 0, 0, 0)
    };

    private TabControl CrearPestanasCatalogo()
    {
        var pestanas = new TabControl { Dock = DockStyle.Fill, Name = nameof(pestanasCatalogo), Margin = new Padding(0) };
        dgvVehiculos = CrearGrilla(nameof(dgvVehiculos));
        dgvCompradores = CrearGrilla(nameof(dgvCompradores));
        dgvVentas = CrearGrilla(nameof(dgvVentas));

        dgvVehiculos.Columns.AddRange(
            Columna("ID", nameof(Vehiculo.IdVehiculo), 7, numerica: true),
            Columna("Marca", nameof(Vehiculo.Marca), 13),
            Columna("Modelo", nameof(Vehiculo.Modelo), 13),
            Columna("Placa", nameof(Vehiculo.Placa), 10),
            Columna("Chasis", nameof(Vehiculo.Chasis), 13),
            Columna("Año", nameof(Vehiculo.Anio), 7, numerica: true),
            Columna("Color", nameof(Vehiculo.Color), 10),
            Columna("Precio", nameof(Vehiculo.Precio), 14, numerica: true),
            Columna("Estado", nameof(Vehiculo.Estado), 13));

        dgvCompradores.Columns.AddRange(
            Columna("ID", nameof(CompradorResumen.Id), 15, numerica: true),
            Columna("Nombre", nameof(CompradorResumen.Nombre), 85));

        dgvVentas.Columns.AddRange(
            Columna("ID", nameof(VentaResumen.Id), 8, numerica: true),
            Columna("ID vehículo", nameof(VentaResumen.VehiculoId), 12, numerica: true),
            Columna("ID comprador", nameof(VentaResumen.CompradorId), 14, numerica: true),
            Columna("Estado", nameof(VentaResumen.Estado), 15),
            Columna("Precio acordado", nameof(VentaResumen.PrecioAcordado), 17, numerica: true),
            Columna("Moneda", nameof(VentaResumen.Moneda), 9),
            Columna("Fecha UTC", nameof(VentaResumen.FechaUtc), 25));

        dgvVehiculos.CellFormatting += FormatearCelda;
        dgvVentas.CellFormatting += FormatearCelda;
        dgvVehiculos.CellToolTipTextNeeded += (_, e) =>
        {
            if (e.RowIndex >= 0 && e.ColumnIndex >= 0 &&
                dgvVehiculos.Columns[e.ColumnIndex].DataPropertyName == nameof(Vehiculo.Chasis) &&
                dgvVehiculos.Rows[e.RowIndex].DataBoundItem is Vehiculo vehiculo)
                e.ToolTipText = vehiculo.Chasis;
        };

        btnRegistrar = CrearBoton("Registrar vehículo", nameof(btnRegistrar), principal: true);
        btnRegistrar.Click += btnRegistrar_Click;
        btnRegistrarComprador = CrearBoton("Registrar comprador", nameof(btnRegistrarComprador), principal: true);
        btnRegistrarComprador.Click += btnRegistrarComprador_Click;
        btnConsultar = CrearBoton("Actualizar", nameof(btnConsultar));
        btnConsultarCompradores = CrearBoton("Actualizar", nameof(btnConsultarCompradores));
        btnConsultarVentas = CrearBoton("Actualizar", nameof(btnConsultarVentas));

        var camposVehiculo = CrearPanelCampos(4, 4);
        cmbMarca = AgregarCampo(camposVehiculo, "Marca", 0, 0, CrearSelectorEditable());
        cmbModelo = AgregarCampo(camposVehiculo, "Modelo", 1, 0, CrearSelectorEditable());
        txtPlaca = AgregarCampo(camposVehiculo, "Placa", 2, 0);
        txtChasis = AgregarCampo(camposVehiculo, "Chasis (17 caracteres)", 3, 0);
        txtAnio = AgregarCampo(camposVehiculo, "Año", 0, 2);
        txtColor = AgregarCampo(camposVehiculo, "Color (opcional)", 1, 2);
        txtPrecio = AgregarCampo(camposVehiculo, "Precio (USD, sin miles)", 2, 2);

        var camposComprador = CrearPanelCampos(3, 2);
        txtDocumentoComprador = AgregarCampo(camposComprador, "Documento", 0, 0);
        txtNombreComprador = AgregarCampo(camposComprador, "Nombre", 1, 0);
        txtCorreoComprador = AgregarCampo(camposComprador, "Correo", 2, 0);

        lblAyudaVehiculo = CrearAyudaRegistro();
        lblAyudaComprador = CrearAyudaRegistro();
        pestanas.TabPages.Add(CrearPestana("Vehículos", dgvVehiculos, btnConsultar, camposVehiculo,
            btnRegistrar, lblAyudaVehiculo));
        pestanas.TabPages.Add(CrearPestana("Compradores", dgvCompradores, btnConsultarCompradores, camposComprador,
            btnRegistrarComprador, lblAyudaComprador));
        pestanas.TabPages.Add(CrearPestana("Ventas", dgvVentas, btnConsultarVentas));
        return pestanas;
    }

    private static TabPage CrearPestana(string titulo, DataGridView grilla, Button actualizar,
        TableLayoutPanel? campos = null, Button? registrar = null, Label? ayuda = null)
    {
        var pestana = new TabPage(titulo) { Padding = new Padding(12), BackColor = Color.White };
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 4 };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        if (campos is not null)
            panel.Controls.Add(campos, 0, 0);

        var acciones = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, WrapContents = false, Margin = new Padding(0, 4, 0, 9)
        };
        if (registrar is not null)
            acciones.Controls.Add(registrar);
        acciones.Controls.Add(actualizar);
        panel.Controls.Add(acciones, 0, 1);
        if (ayuda is not null)
            panel.Controls.Add(ayuda, 0, 2);
        panel.Controls.Add(grilla, 0, 3);
        pestana.Controls.Add(panel);
        return pestana;
    }

    private static TableLayoutPanel CrearPanelCampos(int columnas, int filas)
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, AutoSize = true, ColumnCount = columnas, RowCount = filas, Margin = new Padding(0)
        };
        for (int i = 0; i < columnas; i++)
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f / columnas));
        for (int i = 0; i < filas; i++)
            panel.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        return panel;
    }

    private static Label CrearAyudaRegistro() => new()
    {
        ForeColor = TextoSecundario, AutoSize = true, Margin = new Padding(0, 0, 0, 6)
    };

    private static ComboBox CrearSelectorEditable() => new()
    {
        DropDownStyle = ComboBoxStyle.DropDown, AutoCompleteMode = AutoCompleteMode.Suggest,
        AutoCompleteSource = AutoCompleteSource.ListItems
    };

    private static TextBox AgregarCampo(TableLayoutPanel panel, string titulo, int columna, int fila) =>
        AgregarCampo(panel, titulo, columna, fila, new TextBox());

    private static T AgregarCampo<T>(TableLayoutPanel panel, string titulo, int columna, int fila, T entrada)
        where T : Control
    {
        var etiqueta = new Label { Text = titulo, AutoSize = true, Margin = new Padding(0, 2, 8, 2) };
        entrada.AccessibleName = titulo;
        entrada.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        entrada.Margin = new Padding(0, 0, 24, 8);
        panel.Controls.Add(etiqueta, columna, fila);
        panel.Controls.Add(entrada, columna, fila + 1);
        return entrada;
    }

    private static Button CrearBoton(string texto, string nombre, bool principal = false)
    {
        var boton = new Button
        {
            Name = nombre, Text = texto, AutoSize = true, Enabled = false, FlatStyle = FlatStyle.Flat,
            ForeColor = TextoPrincipal, BackColor = Fondo, UseVisualStyleBackColor = false,
            AutoSizeMode = AutoSizeMode.GrowAndShrink, MinimumSize = new Size(principal ? 166 : 105, 36),
            Padding = new Padding(10, 3, 10, 3), Margin = new Padding(0, 0, 8, 0)
        };
        boton.FlatAppearance.BorderColor = Borde;
        if (principal)
        {
            boton.EnabledChanged += (_, _) =>
            {
                boton.BackColor = boton.Enabled ? TextoSecundario : Fondo;
                boton.ForeColor = boton.Enabled ? Color.White : TextoSecundario;
            };
        }
        return boton;
    }

    private static DataGridView CrearGrilla(string nombre) => new()
    {
        Name = nombre, Dock = DockStyle.Fill, Margin = new Padding(0), ReadOnly = true, AutoGenerateColumns = false,
        AllowUserToAddRows = false, AllowUserToDeleteRows = false, AllowUserToResizeRows = false, RowHeadersVisible = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = Color.White,
        BorderStyle = BorderStyle.FixedSingle, GridColor = Borde, EnableHeadersVisualStyles = false,
        ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.AutoSize,
        ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle { BackColor = Fondo, ForeColor = TextoPrincipal, Padding = new Padding(3, 5, 3, 5) },
        DefaultCellStyle = new DataGridViewCellStyle { ForeColor = TextoPrincipal, SelectionBackColor = TextoSecundario, SelectionForeColor = Color.White },
        AlternatingRowsDefaultCellStyle = new DataGridViewCellStyle { BackColor = Fondo },
        MultiSelect = false, SelectionMode = DataGridViewSelectionMode.FullRowSelect
    };

    private static DataGridViewTextBoxColumn Columna(string encabezado, string propiedad, float peso, bool numerica = false)
    {
        var alineacion = numerica ? DataGridViewContentAlignment.MiddleRight : DataGridViewContentAlignment.MiddleLeft;
        return new DataGridViewTextBoxColumn
        {
            HeaderText = encabezado, DataPropertyName = propiedad, Name = "col" + propiedad, FillWeight = peso,
            ReadOnly = true, SortMode = DataGridViewColumnSortMode.Automatic,
            DefaultCellStyle = new DataGridViewCellStyle { Alignment = alineacion },
            HeaderCell = { Style =
            {
                Alignment = alineacion,
                BackColor = encabezado == "ID" ? TextoSecundario : Fondo,
                ForeColor = encabezado == "ID" ? Color.White : TextoPrincipal,
                SelectionBackColor = TextoSecundario,
                SelectionForeColor = Color.White
            } }
        };
    }
}
