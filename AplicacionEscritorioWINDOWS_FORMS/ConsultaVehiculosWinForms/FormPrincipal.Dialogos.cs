namespace ConsultaVehiculosWinForms;

public partial class FormPrincipal
{
    private bool dialogoErrorActivo;

    private bool MostrarDialogo(ErrorRegistro error)
    {
        if (cerrado || dialogoErrorActivo)
            return false;

        dialogoErrorActivo = true;
        try
        {
            using var imagen = SystemIcons.Warning.ToBitmap();
            using var fuenteTitulo = new Font(Font, FontStyle.Bold);
            Rectangle area = Screen.FromControl(this).WorkingArea;
            int margen = LogicalToDeviceUnits(16);
            int ancho = Math.Min(LogicalToDeviceUnits(500), area.Width - 2 * margen);
            int altoDisponible = area.Height - LogicalToDeviceUnits(80);
            int ladoIcono = LogicalToDeviceUnits(32);
            int columnaIcono = ladoIcono + LogicalToDeviceUnits(12);
            int anchoTexto = ancho - 2 * margen - columnaIcono;
            using var dialogo = new Form
            {
                Text = error.Titulo, StartPosition = FormStartPosition.CenterParent,
                FormBorderStyle = FormBorderStyle.FixedDialog, ShowInTaskbar = false,
                MinimizeBox = false, MaximizeBox = false, Padding = new Padding(margen),
                AutoSize = false, AutoScaleMode = AutoScaleMode.None,
                ClientSize = new Size(ancho, LogicalToDeviceUnits(200)),
                Font = Font, BackColor = Fondo, ForeColor = TextoPrincipal
            };
            var contenido = new TableLayoutPanel
            {
                ColumnCount = 2, RowCount = 3, Dock = DockStyle.Top, AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink, Margin = Padding.Empty
            };
            contenido.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, columnaIcono));
            contenido.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            for (int fila = 0; fila < contenido.RowCount; fila++)
                contenido.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            var icono = new PictureBox
            {
                Image = imagen, SizeMode = PictureBoxSizeMode.Zoom, Size = new Size(ladoIcono, ladoIcono),
                Margin = Padding.Empty, AccessibleName = "Advertencia", TabStop = false
            };
            contenido.Controls.Add(icono, 0, 0);
            contenido.SetRowSpan(icono, 2);
            var titulo = new Label
            {
                Text = error.Titulo, Font = fuenteTitulo, AutoSize = true, MaximumSize = new Size(anchoTexto, 0),
                Margin = new Padding(0, 0, 0, LogicalToDeviceUnits(6))
            };
            contenido.Controls.Add(titulo, 1, 0);
            var mensaje = new Label
            {
                Text = error.Mensaje, AutoSize = true, MaximumSize = titulo.MaximumSize,
                ForeColor = TextoSecundario, Margin = Padding.Empty
            };
            contenido.Controls.Add(mensaje, 1, 1);
            var accion = CrearBoton(error.Accion, "cerrarDialogoError", principal: true);
            accion.Enabled = true;
            accion.DialogResult = DialogResult.OK;
            accion.MinimumSize = LogicalToDeviceUnits(accion.MinimumSize);
            accion.Padding = new Padding(LogicalToDeviceUnits(10), LogicalToDeviceUnits(3),
                LogicalToDeviceUnits(10), LogicalToDeviceUnits(3));
            accion.Margin = new Padding(0, LogicalToDeviceUnits(14), 0, 0);
            accion.Anchor = AnchorStyles.Right;
            contenido.Controls.Add(accion, 0, 2);
            contenido.SetColumnSpan(accion, 2);
            dialogo.Controls.Add(contenido);
            Size espacio = new(ancho - 2 * margen, 0);
            int alto = contenido.GetPreferredSize(espacio).Height + 2 * margen;
            if (alto > altoDisponible)
            {
                dialogo.AutoScroll = true;
                anchoTexto -= LogicalToDeviceUnits(20);
                titulo.MaximumSize = mensaje.MaximumSize = new Size(anchoTexto, 0);
            }
            dialogo.ClientSize = new Size(ancho, Math.Min(alto, altoDisponible));
            dialogo.AcceptButton = accion;
            dialogo.CancelButton = accion;
            dialogo.ActiveControl = accion;
            dialogo.ShowDialog(this);
            return true;
        }
        finally
        {
            dialogoErrorActivo = false;
        }
    }
}
