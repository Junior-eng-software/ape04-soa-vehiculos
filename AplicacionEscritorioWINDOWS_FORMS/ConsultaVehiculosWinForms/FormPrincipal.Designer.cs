namespace ConsultaVehiculosWinForms;

partial class FormPrincipal
{
    private System.ComponentModel.IContainer? components = null;
    private Label lblTitulo = null!;
    private Label lblSubtitulo = null!;
    private Label lblToken = null!;
    private TextBox txtToken = null!;
    private Button btnConsultar = null!;
    private Label lblEstado = null!;
    private Label lblTotal = null!;
    private DataGridView dgvVehiculos = null!;
    private TextBox txtMarca = null!;
    private TextBox txtModelo = null!;
    private TextBox txtPlaca = null!;
    private TextBox txtChasis = null!;
    private TextBox txtAnio = null!;
    private TextBox txtColor = null!;
    private TextBox txtPrecio = null!;
    private Button btnRegistrar = null!;
    private TextBox txtDocumentoComprador = null!;
    private TextBox txtNombreComprador = null!;
    private TextBox txtCorreoComprador = null!;
    private Button btnRegistrarComprador = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            components?.Dispose();
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        DataGridViewCellStyle dataGridViewCellStyle1 = new DataGridViewCellStyle();
        lblTitulo = new Label();
        lblSubtitulo = new Label();
        lblToken = new Label();
        txtToken = new TextBox();
        btnConsultar = new Button();
        lblEstado = new Label();
        lblTotal = new Label();
        dgvVehiculos = new DataGridView();
        GroupBox registro = CrearControlesRegistro();
        GroupBox compradores = CrearControlesCompradores();
        ((System.ComponentModel.ISupportInitialize)dgvVehiculos).BeginInit();
        SuspendLayout();
        // 
        // lblTitulo
        // 
        lblTitulo.AutoSize = true;
        lblTitulo.Font = new Font("Segoe UI", 20F, FontStyle.Bold);
        lblTitulo.ForeColor = Color.FromArgb(31, 41, 55);
        lblTitulo.Location = new Point(28, 21);
        lblTitulo.Name = "lblTitulo";
        lblTitulo.Size = new Size(361, 46);
        lblTitulo.TabIndex = 0;
        lblTitulo.Text = "Vehículos registrados";
        lblTitulo.Click += lblTitulo_Click;
        // 
        // lblSubtitulo
        // 
        lblSubtitulo.AutoSize = true;
        lblSubtitulo.Font = new Font("Segoe UI", 10F);
        lblSubtitulo.ForeColor = Color.FromArgb(90, 97, 108);
        lblSubtitulo.Location = new Point(30, 71);
        lblSubtitulo.Name = "lblSubtitulo";
        lblSubtitulo.Size = new Size(0, 23);
        lblSubtitulo.TabIndex = 1;
        // 
        // lblToken
        // 
        lblToken.AutoSize = true;
        lblToken.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        lblToken.Location = new Point(30, 113);
        lblToken.Name = "lblToken";
        lblToken.Size = new Size(45, 23);
        lblToken.TabIndex = 2;
        lblToken.Text = "JWT";
        // 
        // txtToken
        // 
        txtToken.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtToken.Location = new Point(30, 144);
        txtToken.Name = "txtToken";
        txtToken.Size = new Size(975, 30);
        txtToken.TabIndex = 0;
        txtToken.UseSystemPasswordChar = true;
        // 
        // btnConsultar
        // 
        btnConsultar.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        btnConsultar.Location = new Point(30, 196);
        btnConsultar.Name = "btnConsultar";
        btnConsultar.Size = new Size(212, 42);
        btnConsultar.TabIndex = 1;
        btnConsultar.Text = "Consultar";
        btnConsultar.UseVisualStyleBackColor = true;
        btnConsultar.Click += btnConsultar_Click;
        // 
        // lblEstado
        // 
        lblEstado.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        lblEstado.Font = new Font("Segoe UI", 9F);
        lblEstado.ForeColor = Color.FromArgb(50, 64, 76);
        lblEstado.Location = new Point(268, 202);
        lblEstado.Name = "lblEstado";
        lblEstado.Size = new Size(737, 42);
        lblEstado.TabIndex = 3;
        lblEstado.Text = "Bandera";
        lblEstado.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // lblTotal
        // 
        lblTotal.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        lblTotal.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
        lblTotal.Location = new Point(30, 786);
        lblTotal.Name = "lblTotal";
        lblTotal.Size = new Size(975, 30);
        lblTotal.TabIndex = 4;
        lblTotal.Text = "Total de vehículos: 0";
        // 
        // dgvVehiculos
        // 
        dgvVehiculos.AllowUserToAddRows = false;
        dgvVehiculos.AllowUserToDeleteRows = false;
        dataGridViewCellStyle1.BackColor = Color.FromArgb(245, 247, 250);
        dgvVehiculos.AlternatingRowsDefaultCellStyle = dataGridViewCellStyle1;
        dgvVehiculos.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        dgvVehiculos.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        dgvVehiculos.BackgroundColor = Color.White;
        dgvVehiculos.ColumnHeadersHeight = 38;
        dgvVehiculos.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
        dgvVehiculos.Location = new Point(30, 520);
        dgvVehiculos.MultiSelect = false;
        dgvVehiculos.Name = "dgvVehiculos";
        dgvVehiculos.ReadOnly = true;
        dgvVehiculos.RowHeadersVisible = false;
        dgvVehiculos.RowHeadersWidth = 51;
        dgvVehiculos.RowTemplate.Height = 30;
        dgvVehiculos.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        dgvVehiculos.Size = new Size(975, 254);
        dgvVehiculos.TabIndex = 4;
        // 
        // FormPrincipal
        // 
        AutoScaleDimensions = new SizeF(9F, 23F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.White;
        ClientSize = new Size(1037, 835);
        Controls.Add(lblTitulo);
        Controls.Add(lblSubtitulo);
        Controls.Add(lblToken);
        Controls.Add(txtToken);
        Controls.Add(btnConsultar);
        Controls.Add(lblEstado);
        Controls.Add(registro);
        Controls.Add(compradores);
        Controls.Add(dgvVehiculos);
        Controls.Add(lblTotal);
        Font = new Font("Segoe UI", 10F);
        MinimumSize = new Size(940, 700);
        Name = "FormPrincipal";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Form1";
        ((System.ComponentModel.ISupportInitialize)dgvVehiculos).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }

    private GroupBox CrearControlesRegistro()
    {
        var grupo = new GroupBox
        {
            Text = "Registrar vehículo",
            Location = new Point(30, 250),
            Size = new Size(975, 156),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            TabIndex = 2,
            Padding = new Padding(10, 6, 10, 8)
        };
        var campos = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 4 };
        for (int i = 0; i < 4; i++)
        {
            campos.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
            campos.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        }
        txtMarca = AgregarCampo("Marca", 0, 0);
        txtModelo = AgregarCampo("Modelo", 1, 0);
        txtPlaca = AgregarCampo("Placa", 2, 0);
        txtChasis = AgregarCampo("Chasis (17 caracteres)", 3, 0);
        txtChasis.MaxLength = 17;
        txtAnio = AgregarCampo("Año", 0, 2);
        txtColor = AgregarCampo("Color (opcional)", 1, 2);
        txtPrecio = AgregarCampo("Precio", 2, 2);
        btnRegistrar = new Button
        {
            Text = "Registrar vehículo", AutoSize = true,
            Dock = DockStyle.Fill, TabIndex = 14, UseVisualStyleBackColor = true
        };
        btnRegistrar.Click += btnRegistrar_Click;
        campos.Controls.Add(btnRegistrar, 3, 3);
        grupo.Controls.Add(campos);
        return grupo;

        TextBox AgregarCampo(string texto, int columna, int fila)
        {
            int orden = fila * 4 + columna * 2;
            campos.Controls.Add(new Label { Text = texto, AutoSize = true, TabIndex = orden }, columna, fila);
            var entrada = new TextBox { AccessibleName = texto, Dock = DockStyle.Fill, TabIndex = orden + 1 };
            campos.Controls.Add(entrada, columna, fila + 1);
            return entrada;
        }
    }

    private GroupBox CrearControlesCompradores()
    {
        var grupo = new GroupBox
        {
            Text = "Registrar comprador",
            Location = new Point(30, 418),
            Size = new Size(975, 90),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
            TabIndex = 3,
            Padding = new Padding(10, 6, 10, 8)
        };
        var campos = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, RowCount = 2 };
        foreach (float ancho in new[] { 20f, 25f, 35f, 20f })
            campos.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, ancho));
        campos.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        campos.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        txtDocumentoComprador = AgregarCampo("Documento", 0);
        txtNombreComprador = AgregarCampo("Nombre", 1);
        txtCorreoComprador = AgregarCampo("Correo", 2);
        btnRegistrarComprador = new Button
        {
            Text = "Registrar comprador", AutoSize = true, Dock = DockStyle.Fill,
            TabIndex = 6, UseVisualStyleBackColor = true
        };
        btnRegistrarComprador.Click += btnRegistrarComprador_Click;
        campos.Controls.Add(btnRegistrarComprador, 3, 1);
        grupo.Controls.Add(campos);
        return grupo;

        TextBox AgregarCampo(string texto, int columna)
        {
            campos.Controls.Add(new Label { Text = texto, AutoSize = true, TabIndex = columna * 2 }, columna, 0);
            var entrada = new TextBox { AccessibleName = texto, Dock = DockStyle.Fill, TabIndex = columna * 2 + 1 };
            campos.Controls.Add(entrada, columna, 1);
            return entrada;
        }
    }

    private static DataGridViewTextBoxColumn Columna(
        string encabezado, string propiedad, float peso, string? formato = null)
    {
        var columna = new DataGridViewTextBoxColumn
        {
            HeaderText = encabezado,
            DataPropertyName = propiedad,
            Name = "col" + propiedad,
            FillWeight = peso,
            ReadOnly = true,
            SortMode = DataGridViewColumnSortMode.Automatic
        };
        if (formato is not null)
        {
            columna.DefaultCellStyle.Format = formato;
            columna.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
        }
        return columna;
    }
}
