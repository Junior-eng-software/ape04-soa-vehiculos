import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { calcularIndicadores, rangoDelPeriodo } from '../src/indicadoresVentas.js';
import { cargarConsultaDeSesion, crearConsulta } from '../src/consulta.js';
import { crearSesion, enviarIngreso, iniciarSesion, sesionInicial } from '../src/sesion.js';

const venta = (id, cambios = {}) => ({
  id, vehiculoId: id, compradorId: 1, estado: 'COMPLETADA',
  precioAcordado: '0.10', moneda: 'USD', fechaUTC: '2026-04-06T04:59:59Z',
  ...cambios,
});
const vehiculo = (idVehiculo, modelo, marca = 'Marca A') => ({
  idVehiculo, modelo, marca, estado: 'DISPONIBLE',
});

let vite;
let Dashboard;
let App;
let PuertaSesion;
let AvisoSinVentas;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, ws: false, watch: null }, appType: 'custom' });
  ({ default: Dashboard, AvisoSinVentas } = await vite.ssrLoadModule('/src/Dashboard.jsx'));
  ({ default: App, PuertaSesion } = await vite.ssrLoadModule('/src/App.jsx'));
});
after(async () => vite?.close());

function renderDashboard(ventas, catalogo) {
  return renderToStaticMarkup(createElement(Dashboard, { ventas, catalogo }));
}

test('filtra por fecha local y estado sobre ventas visibles, incluyendo los límites', () => {
  const rango = rangoDelPeriodo(7, new Date('2026-04-06T04:59:00Z'));
  assert.deepEqual(rango, { desde: '2026-03-30', hasta: '2026-04-05' });
  const datos = calcularIndicadores([
    venta(1, { fechaUTC: '2026-03-30T05:00:00Z' }),
    venta(2),
    venta(3, { fechaUTC: '2026-04-06T05:00:00Z' }),
    venta(4, { fechaUTC: '2026-03-30T04:59:59Z' }),
    venta(5, { estado: 'FALLIDA' }),
    venta(6, { fechaUTC: 'inválida' }),
    venta(7), venta(7, { estado: 'FALLIDA' }),
  ], [vehiculo(1, 'Modelo 1'), vehiculo(2, 'Modelo 2')], { ...rango, estado: 'COMPLETADA' });
  assert.equal(datos.ventasVisibles, 2);
  assert.deepEqual(datos.porEstado, { COMPLETADA: 2 });
  assert.deepEqual(datos.registrosPorDia, { '2026-03-30': 1, '2026-04-05': 1 });
  assert.deepEqual(datos.importesPorMoneda, { USD: '0.20' });
  assert.equal(datos.ventasSinCruce, 0);
  assert.equal(calcularIndicadores([venta(1)], [], { estado: 'PENDIENTE' }).ventasVisibles, 0);
});

test('renderiza importes separados, fechas de registro, estados y cruces por marca', () => {
  const html = renderDashboard({
    estado: 'listo',
    datos: [
      venta(1),
      venta(2, { precioAcordado: '0.20', fechaUTC: '2026-04-08T05:00:00Z' }),
      venta(3, { precioAcordado: '9.95', moneda: 'EUR' }),
      venta(4, { estado: 'FALLIDA' }),
    ],
  }, { estado: 'listo', datos: { vehiculos: [vehiculo(1, 'Uno'), vehiculo(2, 'Dos'), vehiculo(3, 'Tres', 'Marca B')] } });
  assert.match(html, /<small>USD<\/small> 0,30/);
  assert.match(html, /<small>EUR<\/small> 9,95/);
  assert.match(html, /Días con registros · America\/Guayaquil/);
  assert.equal((html.match(/<rect class="diario-barra"/g) ?? []).length, 2);
  assert.match(html, /<time dateTime="2026-04-05"/);
  assert.match(html, /<time dateTime="2026-04-08"/);
  assert.match(html, /conic-gradient\(/);
  assert.match(html, /<span>Marca A<\/span><div[^>]*><div style="width:100%"><\/div><\/div><strong>2<\/strong>/);
  assert.match(html, /<span>Marca B<\/span><div[^>]*><div style="width:50%"><\/div><\/div><strong>1<\/strong>/);
  assert.match(html, /1 sin coincidencia en el catálogo/);
});

test('presenta un solo día y un solo estado sin depender de múltiples puntos', () => {
  const html = renderDashboard({ estado: 'listo', datos: [venta(1)] }, { estado: 'listo', datos: { vehiculos: [] } });
  assert.match(html, /<rect class="diario-barra"[^>]*height="100"/);
  assert.doesNotMatch(html, /<polyline/);
  assert.match(html, /class="dona"[^>]*background-color:var\(--estado-completada\)/);
  assert.match(html, /No hay ventas vinculadas al catálogo/);
});

test('distingue vacío, carga y error sin mostrar resultados inexistentes', () => {
  const catalogo = { estado: 'inicial' };
  assert.match(renderDashboard({ estado: 'listo', datos: [] }, catalogo), /No hay ventas registradas/);
  assert.match(renderDashboard({ estado: 'cargando' }, catalogo), /Cargando resumen…/);
  const error = renderDashboard({ estado: 'error', mensaje: 'HTTP 401: JWT no válido' }, catalogo);
  assert.match(error, /HTTP 401/);
  assert.doesNotMatch(error, /class="diario-barra"|class="dona"/);
});

test('distingue inventario y registros, admite nulos y presenta solo un modelo líder verificable', () => {
  const catalogo = [
    { ...vehiculo(1, 'Uno', 'MarcaPrueba'), estado: 'DISPONIBLE' },
    { ...vehiculo(2, 'Dos'), estado: 'VENDIDO' },
    { ...vehiculo(3, null), estado: null },
    { ...vehiculo(4, 'Sin marca', null), estado: 'VENDIDO' },
  ];
  const ventas = [
    venta(1),
    venta(2, { estado: 'FALLIDA' }),
    venta(3, { vehiculoId: 2, estado: 'PENDIENTE', fechaUTC: 'inválida' }),
    venta(4, { vehiculoId: 3, estado: null, fechaUTC: null }),
  ];
  const resumen = calcularIndicadores(ventas, catalogo);
  assert.deepEqual(resumen.inventario, { total: 4, disponibles: 1, porMarca: [
    { marca: 'MarcaPrueba', disponibles: 1, vendidos: 0 },
    { marca: 'Marca A', disponibles: 0, vendidos: 1 },
  ] });
  assert.deepEqual(resumen.modeloLider, { vehiculo: ['MarcaPrueba', 'Uno'], cantidad: 1 });
  assert.equal(resumen.registrosSinFecha, 2);
  assert.equal(resumen.ventasPorMarcaModelo.find(({ marca }) => marca === 'Marca A').cantidad, 2);
  const html = renderDashboard({ estado: 'listo', datos: ventas }, { estado: 'listo', datos: { vehiculos: catalogo } });
  assert.match(html, /25\s*% de 4 vehículos/);
  assert.match(html, /Registros de ventas por marca/);
  assert.match(html, /Inventario por marca/);
  assert.match(html, /MarcaPrueba Uno/);
  assert.doesNotMatch(html, /<option value="null"/);
  assert.equal(calcularIndicadores(ventas, catalogo, { estado: 'FALLIDA' }).modeloLider, null);
  assert.equal(calcularIndicadores([venta(1), venta(2)], catalogo).modeloLider, null);
  assert.equal(calcularIndicadores([venta(1), venta(9)], catalogo).modeloLider, null);
});

test('muestra inventario con ventas aún sin consultar y omite el porcentaje de un catálogo vacío', () => {
  const inventario = (vehiculos) => renderDashboard({ estado: 'inicial' }, { estado: 'listo', datos: { vehiculos } });
  assert.match(inventario([vehiculo(1, 'Uno')]), /100\s*% de 1 vehículo/);
  const vacio = inventario([]);
  assert.match(vacio, /Catálogo vacío/);
  assert.doesNotMatch(vacio, /NaN|% de 0/);
});

test('en el ingreso se muestran las etiquetas y el formulario; en el área activa se conservan las tres vistas', () => {
  const ingreso = renderToStaticMarkup(createElement(App));
  assert.match(ingreso, /Gestión automotriz/);
  assert.match(ingreso, /<label for="usuario">Usuario<\/label>/);
  assert.match(ingreso, /<label for="clave">Contraseña<\/label>/);
  assert.match(ingreso, /<input(?=[^>]*id="usuario")(?=[^>]*autoComplete="username")(?=[^>]*autofocus="")/);
  assert.match(ingreso, /<input(?=[^>]*id="clave")(?=[^>]*type="password")(?=[^>]*autoComplete="current-password")/);
  assert.match(ingreso, />Iniciar sesión<\/button>/);
  assert.doesNotMatch(ingreso, /id="jwt"|Pega el JWT|Navegación principal|Filtros de ventas|Importe completado/);

  const area = renderToStaticMarkup(createElement(PuertaSesion, {
    estadoSesion: { estado: 'activa', id: 1, identidad: { usuario: 'ana', rol: 'VENDEDOR' } },
    sesion: {},
  }));
  assert.match(area, /aria-current="page">Dashboard<\/button>/);
  assert.match(area, />Vehículos<\/button>/);
  assert.match(area, />Ventas<\/button>/);
  assert.match(area, /id="filtroMarca"/);
  assert.match(area, /Detalle del vehículo/);
  assert.match(area, /ana\s*·\s*VENDEDOR/);
  assert.match(area, />Cerrar sesión<\/button>/);
  assert.equal((area.match(/Cargando resumen…/g) ?? []).length, 1);
  assert.doesNotMatch(area, /id="usuario"|Consultar dashboard|Consultar vehículos|Consultar ventas/);
});

function arnesPuerta(responder) {
  const llamadas = [];
  let estadoSesion = sesionInicial;
  const ejecutarFetch = (ruta, opciones) => {
    llamadas.push(ruta);
    return responder(ruta, opciones);
  };
  const sesion = crearSesion({
    publicar: (estado) => { estadoSesion = estado; },
    autenticar: (usuario, clave, signal, ahora) => iniciarSesion(usuario, clave, signal, ahora, ejecutarFetch),
  });
  const vista = () => renderToStaticMarkup(createElement(PuertaSesion, { estadoSesion, sesion }));
  const cargar = (ruta) => cargarConsultaDeSesion(
    crearConsulta(() => ejecutarFetch(ruta), () => {}), sesion, estadoSesion.id,
  );
  return { sesion, vista, llamadas, cargar };
}

test('sin sesión no hay consultas de datos y la puerta sigue cerrada mientras se verifica identidad', async () => {
  const confirmacion = Promise.withResolvers();
  const identidadSolicitada = Promise.withResolvers();
  const { sesion, vista, llamadas, cargar } = arnesPuerta((ruta) => {
    if (ruta === '/auth/login') return Response.json({ access_token: 'token-ficticio', expires_in: 60 });
    if (ruta === '/api/identidad') {
      identidadSolicitada.resolve();
      return confirmacion.promise;
    }
    return [];
  });
  try {
    assert.doesNotMatch(vista(), /Navegación principal|dashboard|Filtros de ventas|Importe completado/);
    await Promise.all([cargar('/api/ventas'), cargar('/api/vehiculos')]);
    assert.deepEqual(llamadas, []);

    const ingreso = sesion.entrar('ana', 'prueba');
    await identidadSolicitada.promise;
    assert.match(vista(), /<button type="submit" disabled="">Iniciando sesión…<\/button>/);
    assert.doesNotMatch(vista(), /Navegación principal|dashboard|Filtros de ventas|Importe completado/);
    await Promise.all([cargar('/api/ventas'), cargar('/api/vehiculos')]);
    assert.deepEqual(llamadas, ['/auth/login', '/api/identidad']);

    await sesion.entrar('ana', 'prueba');
    assert.deepEqual(llamadas, ['/auth/login', '/api/identidad']);
    confirmacion.resolve(Response.json({ usuario: 'ana', rolNombre: 'VENDEDOR' }));
    assert.equal(await ingreso, true);
    assert.match(vista(), /Navegación principal/);
    await Promise.all([cargar('/api/ventas'), cargar('/api/vehiculos')]);
    assert.deepEqual(llamadas, ['/auth/login', '/api/identidad', '/api/ventas', '/api/vehiculos']);
  } finally {
    sesion.limpiar();
  }
});

test('un rechazo mantiene el usuario, vacía la contraseña, devuelve el foco y muestra una alerta', async () => {
  const { sesion, vista, llamadas } = arnesPuerta(() =>
    Response.json({ codigo: 'credenciales' }, { status: 401 }));
  const usuario = { value: 'ana' };
  let enfocado = false;
  const clave = { value: 'dato-ficticio', focus: () => { enfocado = true; } };
  let enviado = false;
  const evento = { preventDefault: () => { enviado = true; }, currentTarget: { elements: { usuario, clave } } };
  await enviarIngreso(evento, sesion);
  assert.equal(enviado, true);
  assert.equal(usuario.value, 'ana');
  assert.equal(clave.value, '');
  assert.equal(enfocado, true);
  assert.deepEqual(llamadas, ['/auth/login']);
  const html = vista();
  assert.match(html, /role="alert">Usuario o contraseña incorrectos\./);
  assert.doesNotMatch(html, /Navegación principal|dato-ficticio/);
});

test('el resumen diferencia una lista vacía de una lista excluida por el filtro', () => {
  const html = renderDashboard({ estado: 'listo', datos: [] }, { estado: 'listo', datos: { vehiculos: [] } });
  assert.equal((html.match(/No hay ventas registradas/g) ?? []).length, 1);
  assert.doesNotMatch(html, /No hay ventas para los filtros seleccionados/);
  const filtradas = calcularIndicadores([venta(1)], [], { estado: 'FALLIDA' });
  assert.equal(filtradas.ventasVisibles, 0);
  const filtrado = renderToStaticMarkup(createElement(AvisoSinVentas, { ventasVisibles: filtradas.ventasVisibles, hayFiltros: true }));
  assert.match(filtrado, />No hay ventas para los filtros seleccionados<\/p>/);
  assert.doesNotMatch(filtrado, /No hay ventas registradas/);
  assert.equal(renderToStaticMarkup(createElement(AvisoSinVentas, { ventasVisibles: 1, hayFiltros: true })), '');
});
