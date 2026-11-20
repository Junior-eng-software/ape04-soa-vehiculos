import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listarVehiculos } from '../src/api/vehiculosApi.js';
import { listarVentas } from '../src/api/ventasApi.js';
import { consultaInicial, crearConsulta } from '../src/consulta.js';

test('cancela ambos Fetch al cambiar sesión e ignora respuestas anteriores aunque lleguen tarde', async (t) => {
  const solicitudes = [];
  t.mock.method(globalThis, 'fetch', (ruta, opciones) => new Promise((resolver, rechazar) => {
    solicitudes.push({ ruta, opciones, resolver, rechazar });
  }));
  const ventas = [];
  const vehiculos = [];
  const consultarVentas = crearConsulta(listarVentas, (resultado) => ventas.push(resultado));
  const consultarVehiculos = crearConsulta(listarVehiculos, (resultado) => vehiculos.push(resultado));
  const ventaAnterior = consultarVentas.ejecutar('sesion-1');
  const vehiculoAnterior = consultarVehiculos.ejecutar('sesion-1');
  await consultarVentas.ejecutar('sesion-1');
  await consultarVehiculos.ejecutar('sesion-1');
  assert.equal(solicitudes.length, 2);
  consultarVentas.reiniciar();
  consultarVehiculos.reiniciar();
  assert.ok(solicitudes.every(({ opciones }) => opciones.signal.aborted));
  assert.equal(ventas.at(-1), consultaInicial);
  assert.equal(vehiculos.at(-1), consultaInicial);

  const ventaActual = consultarVentas.ejecutar('sesion-2');
  const vehiculoActual = consultarVehiculos.ejecutar('sesion-2');
  assert.deepEqual(solicitudes.map(({ ruta, opciones }) => [ruta, opciones.headers.get('Authorization')]), [
    ['/api/ventas', 'Bearer sesion-1'], ['/api/vehiculos', 'Bearer sesion-1'],
    ['/api/ventas', 'Bearer sesion-2'], ['/api/vehiculos', 'Bearer sesion-2'],
  ]);
  solicitudes[2].resolver(Response.json([]));
  solicitudes[3].resolver(Response.json([{ idVehiculo: 2 }]));
  await Promise.all([ventaActual, vehiculoActual]);
  solicitudes[0].rechazar(new Error('fallo de red anterior'));
  solicitudes[1].resolver(Response.json([{ idVehiculo: 1 }]));
  await Promise.all([ventaAnterior, vehiculoAnterior]);

  assert.deepEqual(ventas.map(({ estado }) => estado), ['cargando', 'inicial', 'cargando', 'listo']);
  assert.deepEqual(vehiculos.map(({ estado }) => estado), ['cargando', 'inicial', 'cargando', 'listo']);
  assert.deepEqual(ventas.at(-1).datos, []);
  assert.deepEqual(vehiculos.at(-1).datos.vehiculos, [{ idVehiculo: 2 }]);
});

test('muestra el 403 y permite una consulta explícita posterior', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  const resultados = [];
  const consulta = crearConsulta(listarVentas, (resultado) => resultados.push(resultado));
  await consulta.ejecutar('sesion');
  await consulta.ejecutar('sesion');
  assert.deepEqual(resultados.map(({ estado }) => estado), ['cargando', 'error', 'cargando', 'error']);
  assert.match(resultados.at(-1).mensaje, /HTTP 403/);
});
