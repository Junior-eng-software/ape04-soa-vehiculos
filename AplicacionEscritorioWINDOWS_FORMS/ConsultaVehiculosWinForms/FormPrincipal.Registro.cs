using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace ConsultaVehiculosWinForms;

public partial class FormPrincipal
{
    private static readonly StringComparer ComparadorCatalogo = StringComparer.OrdinalIgnoreCase;
    private static readonly Regex FormatoPrecio = new(@"\A[0-9]{1,10}(?:[,.][0-9]{1,2})?\z");
    private static readonly Regex FormatoCorreo = new(@"\A[^@\s]+@[^@\s]+\.[^@\s]+\z");
    private Dictionary<Control, Func<string, string>> reglasRegistro = null!;
    private readonly Dictionary<Control, string> erroresServidor = new();
    private Control[] camposVehiculo = null!;
    private Control[] camposComprador = null!;
    private IReadOnlyList<Vehiculo>? catalogoRegistro;
    private string marcaConfirmada = "";

    private void ConfigurarRegistro()
    {
        camposVehiculo = [cmbMarca, cmbModelo, txtPlaca, txtChasis, txtAnio, txtColor, txtPrecio];
        camposComprador = [txtDocumentoComprador, txtNombreComprador, txtCorreoComprador];
        reglasRegistro = new()
        {
            [cmbMarca] = valor => ValidarLongitud(valor, 1, 50, "La marca debe tener de 1 a 50 caracteres."),
            [cmbModelo] = valor => ValidarLongitud(valor, 1, 50, "El modelo debe tener de 1 a 50 caracteres."),
            [txtPlaca] = valor => ValidarLongitud(valor, 1, 10, "La placa debe tener de 1 a 10 caracteres."),
            [txtChasis] = valor => valor.Length == 17 ? "" : "El chasis debe tener exactamente 17 caracteres.",
            [txtAnio] = valor =>
            {
                int maximo = DateTime.Today.Year + 1;
                return int.TryParse(valor, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out int anio)
                    && anio >= 1900 && anio <= maximo ? "" : $"Ingresa un año entero entre 1900 y {maximo}.";
            },
            [txtColor] = valor => ValidarLongitud(valor, 0, 30, "El color admite hasta 30 caracteres."),
            [txtPrecio] = valor => valor.Length == 0 ? "Ingresa el precio."
                : LeerPrecio(valor, out _) ? "" : "Ingresa un precio positivo con hasta 10 dígitos enteros y 2 decimales. Usa coma o punto decimal sin separadores de miles.",
            [txtDocumentoComprador] = valor => ValidarLongitud(valor, 3, 30, "El documento debe tener de 3 a 30 caracteres."),
            [txtNombreComprador] = valor => ValidarLongitud(valor, 2, 120, "El nombre debe tener de 2 a 120 caracteres."),
            [txtCorreoComprador] = valor => valor.EnumerateRunes().Count() is >= 5 and <= 200 && FormatoCorreo.IsMatch(valor)
                ? "" : "Ingresa un correo válido de 5 a 200 caracteres."
        };

        foreach (Control campo in reglasRegistro.Keys)
        {
            campo.Validating += (_, _) => ValidarCampo(campo);
            campo.TextChanged += (_, _) =>
            {
                if (erroresServidor.Remove(campo) || erroresRegistro.GetError(campo).Length != 0)
                    ValidarCampo(campo);
            };
        }

        cmbMarca.Leave += (_, _) => ConfirmarMarca(cmbMarca.Text);
        cmbMarca.SelectionChangeCommitted += (_, _) => ConfirmarMarca((string?)cmbMarca.SelectedItem ?? cmbMarca.Text);
        cmbModelo.Leave += (_, _) =>
        {
            cmbModelo.Text = GrafiaCatalogo(ModelosDe(marcaConfirmada), cmbModelo.Text);
            ActualizarAyudaRegistro();
        };
        cmbModelo.SelectionChangeCommitted += (_, _) =>
        {
            if (cmbModelo.SelectedItem is string modelo)
                cmbModelo.Text = modelo;
            ActualizarAyudaRegistro();
        };
    }

    private static string ValidarLongitud(string valor, int minimo, int maximo, string error)
    {
        int longitud = valor.EnumerateRunes().Count();
        return longitud >= minimo && longitud <= maximo ? "" : error;
    }

    private static bool LeerPrecio(string valor, out decimal precio)
    {
        precio = 0;
        return FormatoPrecio.IsMatch(valor)
            && decimal.TryParse(valor.Replace(',', '.'), NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out precio)
            && precio > 0;
    }

    private bool ValidarCampo(Control campo)
    {
        string error = reglasRegistro[campo](campo.Text.Trim());
        erroresRegistro.SetError(campo, error.Length > 0 ? error : erroresServidor.GetValueOrDefault(campo, ""));
        return error.Length == 0;
    }

    private bool ValidarFormulario(Vista vista, Control[] campos)
    {
        Control? primero = null;
        foreach (Control campo in campos)
            if (!ValidarCampo(campo))
                primero ??= campo;

        if (primero is null)
            return true;

        Informar(vista, "Revisa los campos señalados antes de registrar.", error: true);
        primero.Select();
        return false;
    }

    private void ActualizarCatalogoRegistro(IReadOnlyList<Vehiculo>? catalogo)
    {
        catalogoRegistro = catalogo;
        ActualizarOpciones(cmbMarca, Opciones(catalogo?.Select(v => v.Marca) ?? []));
        ActualizarOpciones(cmbModelo, ModelosDe(marcaConfirmada));
        ActualizarAyudaRegistro();
    }

    private string[] ModelosDe(string marca) => Opciones(catalogoRegistro?
        .Where(v => ComparadorCatalogo.Equals(v.Marca?.Trim(), marca))
        .Select(v => v.Modelo) ?? []);

    private static string[] Opciones(IEnumerable<string?> valores) => valores
        .Where(valor => !string.IsNullOrWhiteSpace(valor))
        .Select(valor => valor!.Trim())
        .Distinct(ComparadorCatalogo)
        .OrderBy(valor => valor, Ecuador.CompareInfo.GetStringComparer(CompareOptions.IgnoreCase))
        .ToArray();

    private static string GrafiaCatalogo(IEnumerable<string> opciones, string texto)
    {
        string valor = texto.Trim();
        return opciones.FirstOrDefault(opcion => ComparadorCatalogo.Equals(opcion, valor)) ?? valor;
    }

    private void ConfirmarMarca(string texto)
    {
        string marca = GrafiaCatalogo(cmbMarca.Items.Cast<string>(), texto);
        cmbMarca.Text = marca;
        string[] modelos = ModelosDe(marca);
        ActualizarOpciones(cmbModelo, modelos);

        if (marca.EnumerateRunes().Count() is >= 1 and <= 50)
        {
            string modelo = GrafiaCatalogo(modelos, cmbModelo.Text);
            if (marcaConfirmada.Length > 0 && !ComparadorCatalogo.Equals(marcaConfirmada, marca)
                && !modelos.Contains(modelo, ComparadorCatalogo))
            {
                modelo = "";
                erroresRegistro.SetError(cmbModelo, "");
            }
            cmbModelo.Text = modelo;
            marcaConfirmada = marca;
        }

        ActualizarAyudaRegistro();
    }

    private static void ActualizarOpciones(ComboBox selector, string[] opciones)
    {
        if (selector.Items.Cast<string>().SequenceEqual(opciones))
            return;

        string texto = selector.Text;
        int inicio = selector.SelectionStart;
        int longitud = selector.SelectionLength;
        selector.BeginUpdate();
        try
        {
            selector.Items.Clear();
            selector.Items.AddRange(opciones);
            selector.Text = texto;
            if (selector.Focused)
                selector.Select(inicio, longitud);
        }
        finally
        {
            selector.EndUpdate();
        }
    }

    private void ActualizarAyudaRegistro()
    {
        string permiso = identidad switch
        {
            null when tokenEscrito.Length == 0 => "Introduce un JWT para habilitar el registro.",
            null => "El registro requiere una identidad verificada.",
            { PuedeRegistrar: false } => "Solo ADMIN u OPERADOR pueden registrar.",
            _ => ""
        };
        lblAyudaComprador.Text = permiso;
        lblAyudaVehiculo.Text = permiso;
        if (permiso.Length != 0 || catalogoRegistro is null)
            return;

        string marca = cmbMarca.Text.Trim();
        string modelo = cmbModelo.Text.Trim();
        bool nuevaMarca = marca.Length > 0 && !cmbMarca.Items.Cast<string>().Contains(marca, ComparadorCatalogo);
        bool nuevoModelo = marca.Length > 0 && modelo.Length > 0 && !ModelosDe(marca).Contains(modelo, ComparadorCatalogo);
        lblAyudaVehiculo.Text = (nuevaMarca, nuevoModelo) switch
        {
            (true, true) => "Se registrarán una marca y un modelo nuevos.",
            (true, false) => "Marca nueva.",
            (false, true) => "Modelo nuevo para esta marca.",
            _ => ""
        };
    }
}
