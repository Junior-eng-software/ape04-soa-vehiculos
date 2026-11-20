import { iniciarSesion, listarVehiculos } from './api.js';
import { crearSesion } from './sesion.js';

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

const moneda = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const sesion = crearSesion();
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
  solicitud?.abort();
  solicitud = null;
  clearTimeout(temporizador);
  sesion.cerrar();
  formulario.reset();
  formulario.hidden = false;
  panelSesion.hidden = true;
  botonIngresar.disabled = false;
  botonConsultar.disabled = false;
  limpiarListado();
  mostrarMensaje(texto, tipo);
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
    botonConsultar.focus();
    temporizador = setTimeout(sesionVencida, segundos * 1000);
    mostrarMensaje('Sesión iniciada. Puede consultar los vehículos.', 'exito');
  } catch (error) {
    if (!actual.signal.aborted) mostrarMensaje(error.message, 'error');
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      botonIngresar.disabled = false;
    }
  }
});

botonConsultar.addEventListener('click', async () => {
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();

  solicitud?.abort();
  const actual = new AbortController();
  solicitud = actual;
  botonConsultar.disabled = true;
  limpiarListado();
  mostrarMensaje('Consultando vehículos…');

  try {
    const respuesta = await listarVehiculos(jwt, fetch, actual.signal);
    if (actual.signal.aborted) return;
    if (!sesion.leer()) return sesionVencida();
    pintarListado(respuesta.vehiculos);
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
      botonConsultar.disabled = false;
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
