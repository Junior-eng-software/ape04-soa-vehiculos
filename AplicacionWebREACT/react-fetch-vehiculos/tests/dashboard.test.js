import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { calcularIndicadores, rangoDelPeriodo } from '../src/indicadoresVentas.js';

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
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, ws: false, watch: null }, appType: 'custom' });
  ({ default: Dashboard } = await vite.ssrLoadModule('/src/Dashboard.jsx'));
  ({ default: App } = await vite.ssrLoadModule('/src/App.jsx'));
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
  assert.match(renderDashboard({ estado: 'listo', datos: [] }, catalogo), /No hay ventas visibles/);
  assert.match(renderDashboard({ estado: 'cargando' }, catalogo), /Cargando ventas/);
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

test('mantiene las tres vistas y la entrada de JWT manual', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /aria-current="page">Dashboard<\/button>/);
  assert.match(html, />Vehículos<\/button>/);
  assert.match(html, />Ventas<\/button>/);
  assert.match(html, /<input id="jwt" type="password"/);
  assert.match(html, /id="filtroMarca"/);
  assert.match(html, /Detalle del vehículo/);
});
