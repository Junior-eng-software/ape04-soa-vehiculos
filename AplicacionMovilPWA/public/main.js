import { iniciarSesion, listarVehiculos } from './api.js';
import { crearSesion } from './sesion.js';
import { crearRegistroVenta, listarCompradores } from './ventas.js';

// Referencias a los controles de la interfaz móvil.
const formulario = document.querySelector('#formulario');
const campoUsuario = document.querySelector('#usuario');
const campoClave = document.querySelector('#clave');
const botonIngresar = document.querySelector('#ingresar');
const panelSesion = document.querySelector('#sesion-activa');
const botonConsultar = document.querySelector('#consultar');
const botonCerrar = document.querySelector('#cerrar-sesion');
const mensaje = document.querySelector('#mensaje');
const contenedor = document.querySelector('#vehiculos');
const contador = document.querySelector('#contador');
const conexion = document.querySelector('#conexion');
const panelVenta = document.querySelector('#panel-venta');
const formularioVenta = document.querySelector('#formulario-venta');
const selectorVehiculo = document.querySelector('#vehiculo-venta');
const selectorComprador = document.querySelector('#comprador-venta');
const botonCompradores = document.querySelector('#consultar-compradores');
const botonVenta = document.querySelector('#registrar-venta');
const mensajeVenta = document.querySelector('#mensaje-venta');

const moneda = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const sesion = crearSesion();
const registro = crearRegistroVenta();
let solicitud;
let temporizador;

function mostrarMensaje(texto, tipo = 'neutro') {
  mensaje.textContent = texto;
  mensaje.className = `mensaje ${tipo}`;
}

function limpiarListado() {
  contenedor.replaceChildren();
  contador.textContent = '0 vehículos';
}

function mostrarVenta(texto, tipo = 'neutro') {
  mensajeVenta.textContent = texto;
  mensajeVenta.className = 'mensaje ' + tipo;
  mensajeVenta.hidden = !texto;
}

function cargarOpciones(selector, opciones, indicacion) {
  selector.replaceChildren(new Option(indicacion, ''), ...opciones);
}

function actualizarAcciones() {
  const ocupado = Boolean(solicitud);
  const pendiente = registro.pendiente();
  botonConsultar.disabled = ocupado;
  botonCompradores.disabled = ocupado || pendiente;
  selectorVehiculo.disabled = selectorComprador.disabled = ocupado || pendiente;
  botonVenta.disabled = ocupado || !selectorVehiculo.value || !selectorComprador.value;
  botonVenta.textContent = pendiente ? 'Reintentar misma venta' : 'Registrar venta';
}

function crearElemento(etiqueta, clase, contenido) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  // textContent impide interpretar HTML que pudiera venir de la API.
  if (contenido !== undefined) elemento.textContent = String(contenido);
  return elemento;
}

function texto(valor) {
  return valor === null || valor === undefined || valor === '' ? '—' : String(valor);
}

function precio(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const numero = Number(valor);
  return Number.isFinite(numero) ? moneda.format(numero) : texto(valor);
}

function agregarDato(grilla, etiqueta, valor, extra = '') {
  const grupo = crearElemento('div', extra);
  grupo.append(
    crearElemento('span', 'dato-etiqueta', etiqueta),
    crearElemento('span', 'dato-valor', valor),
  );
  grilla.append(grupo);
}

function pintarListado(vehiculos) {
  limpiarListado();
  contador.textContent = `${vehiculos.length} vehículo${vehiculos.length === 1 ? '' : 's'}`;

  if (vehiculos.length === 0) {
    contenedor.append(crearElemento('p', 'vacio', 'HTTP 200: no hay vehículos registrados.'));
    return;
  }

  // Se crea una tarjeta adaptable al tamaño de un teléfono por cada registro.
  for (const vehiculo of vehiculos) {
    const tarjeta = crearElemento('article', 'vehiculo');
    const cabecera = crearElemento('div', 'vehiculo-cabecera');
    const encabezado = crearElemento('div');
    encabezado.append(
      crearElemento('h3', 'vehiculo-titulo', `${texto(vehiculo.marca)} ${texto(vehiculo.modelo)}`),
      crearElemento('span', 'vehiculo-id', `ID: ${texto(vehiculo.idVehiculo ?? vehiculo.id)}`),
    );

    const estado = texto(vehiculo.estado);
    const claseEstado = String(estado).toUpperCase() === 'DISPONIBLE' ? 'disponible'
      : String(estado).toUpperCase() === 'VENDIDO' ? 'vendido' : '';
    cabecera.append(encabezado, crearElemento('span', `estado ${claseEstado}`, estado));

    const grilla = crearElemento('div', 'datos');
    agregarDato(grilla, 'Placa', texto(vehiculo.placa));
    agregarDato(grilla, 'Año', texto(vehiculo.anio));
    agregarDato(grilla, 'Color', texto(vehiculo.color));
    agregarDato(grilla, 'Precio', precio(vehiculo.precio), 'dato-precio');
    tarjeta.append(cabecera, grilla);
    contenedor.append(tarjeta);
  }
}

function cerrarSesion(texto, tipo = 'neutro') {
  const ventaSinConfirmar = registro.pendiente();
  solicitud?.abort();
  solicitud = null;
  clearTimeout(temporizador);
  sesion.cerrar();
  registro.limpiar();
  formulario.reset();
  formulario.hidden = false;
  panelSesion.hidden = true;
  panelVenta.hidden = true;
  botonIngresar.disabled = false;
  cargarOpciones(selectorVehiculo, [], 'Consulte los vehículos');
  cargarOpciones(selectorComprador, [], 'Consulte los compradores');
  mostrarVenta('');
  actualizarAcciones();
  limpiarListado();
  mostrarMensaje(ventaSinConfirmar
    ? texto + ' Había una venta sin confirmar. Verifique su estado antes de volver a registrarla.'
    : texto, tipo);
}

function sesionVencida() {
  cerrarSesion('La sesión venció. Inicie sesión de nuevo.', 'error');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const usuario = campoUsuario.value.trim();
  if (!usuario || !campoClave.value) {
    mostrarMensaje('Ingrese usuario y contraseña.', 'error');
    return;
  }
  solicitud?.abort();
  const actual = new AbortController();
  solicitud = actual;
  botonIngresar.disabled = true;
  mostrarMensaje('Iniciando sesión…');

  try {
    const acceso = iniciarSesion(usuario, campoClave.value, fetch, actual.signal);
    campoClave.value = '';
    const { jwt, segundos } = await acceso;
    if (actual.signal.aborted) return;
    sesion.guardar(jwt, segundos);
    formulario.reset();
    formulario.hidden = true;
    panelSesion.hidden = false;
    panelVenta.hidden = false;
    botonConsultar.focus();
    temporizador = setTimeout(sesionVencida, segundos * 1000);
    mostrarMensaje('Sesión iniciada. Puede consultar los vehículos.', 'exito');
  } catch (error) {
    if (!actual.signal.aborted) mostrarMensaje(error.message, 'error');
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      botonIngresar.disabled = false;
      actualizarAcciones();
    }
  }
});

botonConsultar.addEventListener('click', async () => {
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();
  if (solicitud) return;

  const actual = new AbortController();
  solicitud = actual;
  actualizarAcciones();
  limpiarListado();
  if (!registro.pendiente()) cargarOpciones(selectorVehiculo, [], 'Consulte los vehículos');
  mostrarMensaje('Consultando vehículos…');

  try {
    const respuesta = await listarVehiculos(jwt, fetch, actual.signal);
    if (actual.signal.aborted) return;
    if (!sesion.leer()) return sesionVencida();
    pintarListado(respuesta.vehiculos);
    if (!registro.pendiente()) {
      const opciones = respuesta.vehiculos.filter((v) => v.estado === 'DISPONIBLE'
        && Number.isSafeInteger(v.idVehiculo) && v.idVehiculo > 0)
        .map((v) => new Option([v.marca, v.modelo, '(ID ' + v.idVehiculo + ')'].join(' '), v.idVehiculo));
      cargarOpciones(selectorVehiculo, opciones, opciones.length ? 'Seleccione un vehículo' : 'No hay vehículos disponibles');
    }
    mostrarMensaje(`HTTP ${respuesta.codigoHttp}: ${respuesta.vehiculos.length} vehículo(s) consultado(s).`, 'exito');
  } catch (error) {
    if (actual.signal.aborted) return;
    if (error.codigoHttp === 401) {
      cerrarSesion(error.message + ' Inicie sesión de nuevo.', 'error');
      return;
    }
    // Ante fallos se mantienen vacíos los resultados; nunca se inventan datos.
    mostrarMensaje(error.message, 'error');
    contador.textContent = '0 vehículos';
    contenedor.append(crearElemento('p', 'vacio', 'No hay datos disponibles para mostrar.'));
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      actualizarAcciones();
    }
  }
});

botonCompradores.addEventListener('click', async () => {
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();
  if (solicitud || registro.pendiente()) return;

  const actual = new AbortController();
  solicitud = actual;
  actualizarAcciones();
  cargarOpciones(selectorComprador, [], 'Consulte los compradores');
  mostrarVenta('Consultando compradores…');
  try {
    const compradores = await listarCompradores(jwt, actual.signal);
    if (actual.signal.aborted) return;
    if (!sesion.leer()) return sesionVencida();
    const opciones = compradores.map((c) => new Option(c.nombre + ' (ID ' + c.id + ')', c.id));
    cargarOpciones(selectorComprador, opciones, opciones.length ? 'Seleccione un comprador' : 'No hay compradores visibles');
    mostrarVenta(compradores.length ? 'Seleccione un comprador autorizado.' : 'No hay compradores visibles.');
  } catch (error) {
    if (actual.signal.aborted) return;
    if (error.codigoHttp === 401) return sesionVencida();
    mostrarVenta(error.message, 'error');
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      actualizarAcciones();
    }
  }
});

selectorVehiculo.addEventListener('change', actualizarAcciones);
selectorComprador.addEventListener('change', actualizarAcciones);

formularioVenta.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();
  if (solicitud || !selectorVehiculo.value || !selectorComprador.value) return;

  const datos = { vehiculoId: Number(selectorVehiculo.value), compradorId: Number(selectorComprador.value) };
  const actual = new AbortController();
  solicitud = actual;
  actualizarAcciones();
  mostrarVenta('Enviando solicitud de venta…');
  try {
    const resultado = await registro.registrar(jwt, datos, actual.signal);
    if (actual.signal.aborted || !resultado) return;
    if (!sesion.leer()) return sesionVencida();
    const { codigoHttp, venta } = resultado;
    const importe = venta.precioAcordado === null ? ''
      : ' Importe: ' + venta.precioAcordado + (venta.moneda ? ' ' + venta.moneda : '') + '.';
    const confirmacion = 'HTTP ' + codigoHttp + ': venta ' + venta.id + ', estado ' + venta.estado + '.' + importe;
    if (codigoHttp === 202) {
      mostrarVenta(confirmacion + ' Puede reintentar la misma venta para confirmar su estado.');
    } else {
      selectorVehiculo.selectedOptions[0]?.remove();
      selectorVehiculo.value = '';
      selectorComprador.value = '';
      mostrarVenta(confirmacion, 'exito');
    }
  } catch (error) {
    if (actual.signal.aborted) return;
    if (error.codigoHttp === 401) return sesionVencida();
    mostrarVenta(error.incierto
      ? error.message + ' Resultado sin confirmar. Reintente la misma venta.'
      : error.message, 'error');
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      actualizarAcciones();
    }
  }
});

botonCerrar.addEventListener('click', () => {
  cerrarSesion('Sesión cerrada.');
  campoUsuario.focus();
});

function actualizarConexion() {
  conexion.textContent = navigator.onLine ? 'Navegador conectado' : 'Sin conexión de red';
}
window.addEventListener('online', actualizarConexion);
window.addEventListener('offline', actualizarConexion);
actualizarConexion();

// El Service Worker conserva únicamente recursos visuales, nunca el JWT ni /api.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // La consulta REST sigue funcionando aunque no se instale el modo PWA.
    });
  });
}
