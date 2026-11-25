import { ErrorAcceso, iniciarSesion, listarVehiculos, solicitarApi } from './api.js?v=6';
import { crearAdministracion } from './administracion.js?v=1';
import { crearSesion } from './sesion.js?v=5';
import { consultarVenta, crearRegistroVenta, listarCompradores } from './ventas.js?v=5';

// Referencias a los controles de la interfaz móvil.
const formulario = document.querySelector('#formulario');
const campoUsuario = document.querySelector('#usuario');
const campoClave = document.querySelector('#clave');
const botonIngresar = document.querySelector('#ingresar');
const panelAcceso = document.querySelector('#panel-acceso');
const panelSesion = document.querySelector('#sesion-activa');
const perfilSesion = document.querySelector('#perfil-sesion');
const panelCatalogo = document.querySelector('#panel-catalogo');
const botonCerrar = document.querySelector('#cerrar-sesion');
const mensaje = document.querySelector('#mensaje');
const contenedor = document.querySelector('#vehiculos');
const contador = document.querySelector('#contador');
const filtrosCatalogo = document.querySelector('#filtros-catalogo');
const filtroMarca = document.querySelector('#filtro-marca');
const filtroModelo = document.querySelector('#filtro-modelo');
const filtroEstado = document.querySelector('#filtro-estado');
const botonLimpiarFiltros = document.querySelector('#limpiar-filtros');
const botonMostrarMas = document.querySelector('#mostrar-mas');
const conexion = document.querySelector('#conexion');
const panelVenta = document.querySelector('#panel-venta');
const formularioVenta = document.querySelector('#formulario-venta');
const selectorVehiculo = document.querySelector('#vehiculo-venta');
const selectorComprador = document.querySelector('#comprador-venta');
const botonActualizarListas = document.querySelector('#actualizar-listas');
const estadoListaVehiculos = document.querySelector('#estado-lista-vehiculos');
const estadoListaCompradores = document.querySelector('#estado-lista-compradores');
const botonLimpiarSeleccion = document.querySelector('#limpiar-seleccion');
const botonVenta = document.querySelector('#registrar-venta');
const mensajeVenta = document.querySelector('#mensaje-venta');
const accionesVentaReciente = document.querySelector('#acciones-venta-reciente');
const botonVentaReciente = document.querySelector('#consultar-venta-reciente');
const panelEstadoVenta = document.querySelector('#panel-estado-venta');
const formularioEstadoVenta = document.querySelector('#formulario-estado-venta');
const campoEstadoVenta = document.querySelector('#id-estado-venta');
const botonEstadoVenta = document.querySelector('#consultar-estado-venta');
const mensajeEstadoVenta = document.querySelector('#mensaje-estado-venta');
const detalleEstadoVenta = document.querySelector('#detalle-estado-venta');

const moneda = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const fechaComercial = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil',
});
const sesion = crearSesion();
const administracion = crearAdministracion(sesionVencida);
const registro = crearRegistroVenta();
let puedeVender = false;
let solicitud;
let temporizador;
let idVentaReciente;
const BLOQUE_CATALOGO = 10;
let catalogo = [];
let limiteCatalogo = BLOQUE_CATALOGO;

function mostrarTexto(elemento, texto, codigo) {
  const partes = /^HTTP (\d{3}):\s*(.*)$/.exec(texto);
  elemento.textContent = partes ? partes[2] : texto;
  const http = codigo ?? partes?.[1];
  if (http) elemento.append(crearElemento('small', 'detalle-http', `HTTP ${http}`));
}

function mostrarMensaje(texto, tipo = 'neutro') {
  mostrarTexto(mensaje, texto);
  mensaje.className = `mensaje ${tipo}`;
}

function limpiarListado() {
  contenedor.replaceChildren();
  contador.textContent = '0 coincidencias';
  botonMostrarMas.hidden = true;
}

function mostrarVenta(texto, tipo = 'neutro', codigo) {
  mostrarTexto(mensajeVenta, texto, codigo);
  mensajeVenta.className = 'mensaje ' + tipo;
  mensajeVenta.hidden = !texto;
}

function mostrarEstadoVenta(texto, tipo = 'neutro') {
  mostrarTexto(mensajeEstadoVenta, texto);
  mensajeEstadoVenta.className = 'mensaje ' + tipo;
  mensajeEstadoVenta.hidden = !texto;
  detalleEstadoVenta.replaceChildren();
}

function recordarIdVenta(id) {
  idVentaReciente = id;
  accionesVentaReciente.hidden = id === undefined;
}

function cargarOpciones(selector, opciones, indicacion) {
  selector.replaceChildren(new Option(indicacion, ''), ...opciones);
}

function cargarFiltro(selector, indicacion, campo, vehiculos) {
  const seleccion = selector.value;
  const valores = [...new Set(vehiculos.map((vehiculo) => vehiculo[campo])
    .filter((valor) => typeof valor === 'string' && valor.trim()))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  cargarOpciones(selector, valores.map((valor) => new Option(valor, valor)), indicacion);
  selector.value = valores.includes(seleccion) ? seleccion : '';
  selector.disabled = valores.length === 0;
  if (seleccion !== selector.value) limiteCatalogo = BLOQUE_CATALOGO;
}

function actualizarModelos() {
  const vehiculos = filtroMarca.value ? catalogo.filter((v) => v.marca === filtroMarca.value) : catalogo;
  cargarFiltro(filtroModelo, 'Todos los modelos', 'modelo', vehiculos);
}

function mostrarCatalogo(vehiculos) {
  catalogo = vehiculos;
  filtrosCatalogo.hidden = catalogo.length === 0;
  cargarFiltro(filtroMarca, 'Todas las marcas', 'marca', catalogo);
  actualizarModelos();
  cargarFiltro(filtroEstado, 'Todos los estados', 'estado', catalogo);
  aplicarFiltros();
}

function aplicarFiltros() {
  const marca = filtroMarca.value;
  const modelo = filtroModelo.value;
  const estado = filtroEstado.value;
  botonLimpiarFiltros.disabled = !(marca || modelo || estado);
  pintarListado(catalogo.filter((v) => (!marca || v.marca === marca)
    && (!modelo || v.modelo === modelo) && (!estado || v.estado === estado)));
}

function reiniciarLimiteCatalogo() {
  limiteCatalogo = BLOQUE_CATALOGO;
  aplicarFiltros();
}

filtroMarca.addEventListener('change', () => {
  filtroModelo.value = '';
  actualizarModelos();
  reiniciarLimiteCatalogo();
});
filtroModelo.addEventListener('change', reiniciarLimiteCatalogo);
filtroEstado.addEventListener('change', reiniciarLimiteCatalogo);
botonLimpiarFiltros.addEventListener('click', () => {
  filtroMarca.value = filtroModelo.value = filtroEstado.value = '';
  actualizarModelos();
  reiniciarLimiteCatalogo();
});
botonMostrarMas.addEventListener('click', () => {
  limiteCatalogo += BLOQUE_CATALOGO;
  aplicarFiltros();
});

function limpiarSeleccion() {
  selectorVehiculo.value = '';
  selectorComprador.value = '';
}

function actualizarAcciones() {
  const ocupado = Boolean(solicitud);
  const pendiente = registro.pendiente();
  botonActualizarListas.disabled = ocupado || pendiente;
  selectorVehiculo.disabled = selectorComprador.disabled = !puedeVender || ocupado || pendiente;
  botonLimpiarSeleccion.disabled = !puedeVender || ocupado || pendiente || (!selectorVehiculo.value && !selectorComprador.value);
  botonVenta.disabled = !puedeVender || ocupado || !selectorVehiculo.value || !selectorComprador.value;
  botonVenta.textContent = pendiente ? 'Reintentar misma venta' : 'Registrar venta';
  campoEstadoVenta.disabled = botonEstadoVenta.disabled = botonVentaReciente.disabled = ocupado;
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

function agregarDato(grilla, etiqueta, valor, extra = '', detalle = '') {
  const grupo = crearElemento('div', extra);
  grupo.append(
    crearElemento('span', 'dato-etiqueta', etiqueta),
    crearElemento('span', 'dato-valor', valor),
  );
  if (detalle) grupo.append(crearElemento('small', 'detalle-http', detalle));
  grilla.append(grupo);
}

function pintarListado(vehiculos) {
  limpiarListado();
  contador.textContent = `${vehiculos.length} ${vehiculos.length === 1 ? 'coincidencia' : 'coincidencias'}`;
  botonMostrarMas.hidden = vehiculos.length <= limiteCatalogo;

  if (vehiculos.length === 0) {
    contenedor.append(crearElemento('p', 'vacio', catalogo.length
      ? 'Ningún vehículo coincide con los filtros seleccionados.' : 'No hay vehículos registrados.'));
    return;
  }

  // Se crea una tarjeta adaptable al tamaño de un teléfono por cada registro.
  for (const vehiculo of vehiculos.slice(0, limiteCatalogo)) {
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

function mostrarSesionActiva(activa) {
  panelAcceso.hidden = activa;
  panelSesion.hidden = panelCatalogo.hidden = panelVenta.hidden = panelEstadoVenta.hidden = !activa;
}

function cerrarSesion(texto, tipo = 'neutro') {
  const ventaSinConfirmar = registro.pendiente();
  solicitud?.abort();
  solicitud = null;
  clearTimeout(temporizador);
  sesion.cerrar();
  administracion.cerrar();
  puedeVender = false;
  perfilSesion.textContent = '';
  registro.limpiar();
  formulario.reset();
  mostrarSesionActiva(false);
  botonIngresar.disabled = false;
  cargarOpciones(selectorVehiculo, [], 'Seleccione un vehículo');
  cargarOpciones(selectorComprador, [], 'Seleccione un comprador');
  estadoListaVehiculos.textContent = '';
  estadoListaCompradores.textContent = '';
  mostrarVenta('');
  recordarIdVenta();
  formularioEstadoVenta.reset();
  mostrarEstadoVenta('');
  actualizarAcciones();
  limiteCatalogo = BLOQUE_CATALOGO;
  mostrarCatalogo([]);
  limpiarListado();
  mostrarMensaje(ventaSinConfirmar
    ? texto + ' Había una venta sin confirmar. Verifique su estado antes de intentar otra operación.'
    : texto, tipo);
}

function sesionVencida() {
  cerrarSesion('La sesión venció. Inicie sesión de nuevo.', 'error');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (solicitud) return;
  let actual;
  let perfil;

  try {
    const usuario = campoUsuario.value.trim();
    if (!usuario || !campoClave.value) {
      mostrarMensaje('Ingrese usuario y contraseña.', 'error');
      return;
    }
    actual = new AbortController();
    solicitud = actual;
    botonIngresar.disabled = true;
    mostrarMensaje('Iniciando sesión…');
    const acceso = iniciarSesion(usuario, campoClave.value, fetch, actual.signal);
    campoClave.value = '';
    const { jwt, segundos } = await acceso;
    if (actual.signal.aborted) return;
    sesion.guardar(jwt, segundos);
    const venceEn = Date.now() + segundos * 1000;
    const identidad = await solicitarApi('/api/identidad', jwt, actual.signal);
    if (actual.signal.aborted) return;
    if (!sesion.leer()) return sesionVencida();
    const base = identidad?.roles?.[0];
    if (!['ROLE_CONSULTA', 'ROLE_OPERADOR', 'ROLE_ADMIN'].includes(base)
        || !identidad.usuario || typeof identidad.usuario !== 'string'
        || !identidad.rolNombre || typeof identidad.rolNombre !== 'string') {
      throw new ErrorAcceso('El servidor devolvió una identidad inválida.');
    }
    puedeVender = base !== 'ROLE_CONSULTA';
    perfilSesion.textContent = `${identidad.usuario} · ${identidad.rolNombre}`;
    formulario.reset();
    mostrarSesionActiva(true);
    mostrarVenta(puedeVender ? '' : 'El perfil CONSULTA no puede registrar ventas.', 'aviso');
    botonActualizarListas.focus();
    temporizador = setTimeout(sesionVencida, Math.max(0, venceEn - Date.now()));
    perfil = { jwt, base, usuario: identidad.usuario };
  } catch (error) {
    if (actual?.signal.aborted) return;
    sesion.cerrar();
    puedeVender = false;
    perfilSesion.textContent = '';
    clearTimeout(temporizador);
    mostrarMensaje(error.codigoHttp === 403 ? 'HTTP 403: No tiene permiso para consultar su identidad.'
      : error instanceof ErrorAcceso ? error.message
      : 'No se pudo iniciar la sesión en la aplicación. Vuelva a intentarlo.', 'error');
    mostrarSesionActiva(false);
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      botonIngresar.disabled = false;
    }
  }
  if (perfil) await Promise.all([
    actualizarListas(),
    perfil.base === 'ROLE_ADMIN' && administracion.abrir(perfil.jwt, perfil.usuario),
  ]);
});

function informarDisponibles(cantidad) {
  estadoListaVehiculos.textContent = cantidad === 0 ? 'No hay vehículos disponibles.'
    : `${cantidad} ${cantidad === 1 ? 'vehículo disponible' : 'vehículos disponibles'}.`;
}

async function cargarLista(jwt, signal, selector, estado, consultar, nombre) {
  cargarOpciones(selector, [], 'Cargando...');
  estado.className = 'estado-lista';
  estado.textContent = `Cargando ${nombre}…`;
  try {
    const datos = await consultar(jwt, signal);
    if (signal.aborted) return;
    if (!sesion.leer()) return sesionVencida();
    return datos;
  } catch (error) {
    if (signal.aborted) return;
    if (error.codigoHttp === 401) return sesionVencida();
    cargarOpciones(selector, [], 'Lista no disponible');
    estado.className = 'estado-lista error';
    mostrarTexto(estado, error.codigoHttp === 403 ? `No tiene permiso para consultar ${nombre}.`
      : `No se pudieron cargar ${nombre}. Use «Actualizar listas» para reintentar.`, error.codigoHttp);
  }
}

async function cargarVehiculos(jwt, signal) {
  if (!catalogo.length) {
    limpiarListado();
    contenedor.append(crearElemento('p', 'vacio', 'Cargando catálogo…'));
  }
  const respuesta = await cargarLista(jwt, signal, selectorVehiculo, estadoListaVehiculos,
    (token, cancelacion) => listarVehiculos(token, fetch, cancelacion), 'vehículos');
  if (signal.aborted) return;
  if (!respuesta) {
    catalogo = [];
    filtrosCatalogo.hidden = true;
    limpiarListado();
    contenedor.append(crearElemento('p', 'vacio', 'El catálogo no está disponible.'));
    return;
  }
  const vehiculos = respuesta.vehiculos.filter((v) => v && typeof v === 'object');
  mostrarCatalogo(vehiculos);
  const opciones = vehiculos.filter((v) => v.estado === 'DISPONIBLE'
    && Number.isSafeInteger(v.idVehiculo) && v.idVehiculo > 0)
    .map((v) => new Option(`${v.marca} ${v.modelo} (ID ${v.idVehiculo})`, String(v.idVehiculo)));
  cargarOpciones(selectorVehiculo, opciones, opciones.length ? 'Seleccione un vehículo' : 'No hay vehículos disponibles');
  informarDisponibles(opciones.length);
}

async function cargarCompradores(jwt, signal) {
  const compradores = await cargarLista(jwt, signal, selectorComprador, estadoListaCompradores,
    listarCompradores, 'compradores');
  if (!compradores || signal.aborted) return;
  const opciones = compradores.map((c) => new Option(`${c.nombre} (ID ${c.id})`, String(c.id)));
  cargarOpciones(selectorComprador, opciones, opciones.length ? 'Seleccione un comprador' : 'No hay compradores disponibles');
  estadoListaCompradores.textContent = opciones.length ? '' : 'Registre un comprador desde Windows Forms y actualice las listas.';
}

async function actualizarListas() {
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();
  if (solicitud || registro.pendiente()) return;

  const actual = new AbortController();
  solicitud = actual;
  actualizarAcciones();
  try {
    await Promise.all([
      cargarVehiculos(jwt, actual.signal),
      puedeVender && cargarCompradores(jwt, actual.signal),
    ]);
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      actualizarAcciones();
    }
  }
}

botonActualizarListas.addEventListener('click', actualizarListas);

selectorVehiculo.addEventListener('change', actualizarAcciones);
selectorComprador.addEventListener('change', actualizarAcciones);
botonLimpiarSeleccion.addEventListener('click', () => {
  if (solicitud || registro.pendiente()) return;
  limpiarSeleccion();
  actualizarAcciones();
});

async function cargarEstadoVenta() {
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();
  if (solicitud) return;

  const id = campoEstadoVenta.value.trim();
  const actual = new AbortController();
  solicitud = actual;
  actualizarAcciones();
  mostrarEstadoVenta('Consultando estado de la venta…');
  try {
    const venta = await consultarVenta(jwt, id, actual.signal);
    if (actual.signal.aborted) return;
    if (!sesion.leer()) return sesionVencida();
    const tipo = { COMPLETADA: 'exito', EN_REVISION: 'aviso', PENDIENTE: 'aviso', FALLIDA: 'error' };
    const estados = { COMPLETADA: 'Completada', EN_REVISION: 'En revisión', PENDIENTE: 'Pendiente', FALLIDA: 'Fallida' };
    mostrarEstadoVenta(`Venta ${venta.id} · ${estados[venta.estado]}`, tipo[venta.estado]);
    const grilla = crearElemento('div', 'datos');
    agregarDato(grilla, 'ID de vehículo', venta.vehiculoId);
    agregarDato(grilla, 'ID de comprador', venta.compradorId);
    agregarDato(grilla, 'Importe', venta.precioAcordado === null ? '—'
      : [venta.precioAcordado, venta.moneda].filter(Boolean).join(' '), 'dato-precio');
    agregarDato(grilla, 'Fecha de registro en Guayaquil', fechaComercial.format(new Date(venta.fechaUTC)), '', venta.fechaUTC);
    detalleEstadoVenta.append(grilla);
  } catch (error) {
    if (actual.signal.aborted) return;
    if (error.codigoHttp === 401) return sesionVencida();
    mostrarEstadoVenta(error.message, error.codigoHttp === 404 ? 'aviso' : 'error');
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      actualizarAcciones();
    }
  }
}

formularioEstadoVenta.addEventListener('submit', (evento) => {
  evento.preventDefault();
  return cargarEstadoVenta();
});

campoEstadoVenta.addEventListener('input', () => mostrarEstadoVenta(''));
botonVentaReciente.addEventListener('click', () => {
  if (!Number.isSafeInteger(idVentaReciente) || idVentaReciente <= 0) return;
  campoEstadoVenta.value = String(idVentaReciente);
  return cargarEstadoVenta();
});

formularioVenta.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const jwt = sesion.leer();
  if (!jwt) return sesionVencida();
  if (!puedeVender || solicitud || !selectorVehiculo.value || !selectorComprador.value) return;

  if (!registro.pendiente()) recordarIdVenta();
  const datos = { vehiculoId: Number(selectorVehiculo.value), compradorId: Number(selectorComprador.value) };
  const actual = new AbortController();
  solicitud = actual;
  actualizarAcciones();
  mostrarVenta('Enviando solicitud de venta…');
  let idConfirmado;
  try {
    const resultado = await registro.registrar(jwt, datos, actual.signal);
    if (actual.signal.aborted || !resultado) return;
    if (!sesion.leer()) return sesionVencida();
    const { codigoHttp, venta } = resultado;
    recordarIdVenta(venta.id);
    const importe = venta.precioAcordado === null ? ''
      : ' Importe: ' + venta.precioAcordado + (venta.moneda ? ' ' + venta.moneda : '') + '.';
    if (codigoHttp === 202) {
      mostrarVenta(`Venta ${venta.id} sin confirmar. Consulte su estado o reintente la misma venta.`, 'aviso', codigoHttp);
    } else {
      selectorVehiculo.selectedOptions[0]?.remove();
      limpiarSeleccion();
      informarDisponibles(selectorVehiculo.options.length - 1);
      mostrarVenta(`Venta ${venta.id} completada.` + importe, 'exito', codigoHttp);
      idConfirmado = venta.id;
    }
  } catch (error) {
    if (actual.signal.aborted) return;
    if (error.codigoHttp === 401) return sesionVencida();
    mostrarVenta(error.incierto
      ? error.message + ' Resultado sin confirmar. ' + (idVentaReciente === undefined
        ? 'Use «Reintentar misma venta» para verificar la operación.'
        : 'Consulte el estado con el ID disponible.')
      : error.message, 'error');
  } finally {
    if (solicitud === actual) {
      solicitud = null;
      actualizarAcciones();
    }
  }
  if (Number.isSafeInteger(idConfirmado) && idConfirmado > 0) {
    campoEstadoVenta.value = String(idConfirmado);
    await cargarEstadoVenta();
  }
});

botonCerrar.addEventListener('click', () => {
  cerrarSesion('Sesión cerrada.');
  campoUsuario.focus();
});

function actualizarConexion() {
  conexion.textContent = navigator.onLine ? 'Con conexión' : 'Sin conexión';
}
window.addEventListener('online', actualizarConexion);
window.addEventListener('offline', actualizarConexion);
actualizarConexion();
