import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { once } from 'node:events';
import { listarVehiculos } from '../src/api/vehiculosApi.js';
import { listarVentas } from '../src/api/ventasApi.js';
import { cargarConsultaDeSesion, crearConsulta } from '../src/consulta.js';
import { crearSesion, iniciarSesion, mensajeVencida, sesionInicial } from '../src/sesion.js';
import { crearProxyLogin } from '../vite-login.js';

const tokenFicticio = 'ficha-de-prueba';
const usuario = { usuario: 'ana', roles: ['ROLE_OPERADOR'], rolNombre: 'VENDEDOR' };
const loginValido = () => Response.json({ access_token: tokenFicticio, expires_in: 2 });

function arnesSesion(ejecutarFetch) {
  let reloj = 100;
  let tarea;
  const estados = [];
  const sesion = crearSesion({
    publicar: (estado) => estados.push(estado),
    autenticar: (nombre, clave, signal, ahora) => iniciarSesion(nombre, clave, signal, ahora, ejecutarFetch),
    ahora: () => reloj,
    programar: (vencer, espera) => { tarea = { vencer, espera }; return tarea; },
    cancelar: () => { tarea = undefined; },
  });
  const credenciales = () => sesion.obtenerSesion(estados.at(-1)?.id);
  return { sesion, estados, credenciales, mover: (milisegundos) => { reloj += milisegundos; }, tarea: () => tarea };
}

async function simularSesion(ruta) {
  return ruta === '/auth/login' ? loginValido() : Response.json(usuario);
}

test('login de mismo origen, consulta identidad y publica el usuario y rol propio', async () => {
  const llamadas = [];
  const { sesion, estados, credenciales } = arnesSesion(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return simularSesion(ruta);
  });
  await sesion.entrar(' ana ', ' prueba ');
  assert.deepEqual(llamadas.map(({ ruta }) => ruta), ['/auth/login', '/api/identidad']);
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { username: 'ana', password: ' prueba ' });
  assert.equal(llamadas[0].opciones.headers.Authorization, undefined);
  assert.equal(llamadas[1].opciones.headers.Authorization, 'Bearer ' + tokenFicticio);
  assert.equal((credenciales()?.token ?? ''), tokenFicticio);
  assert.deepEqual(estados.at(-1).identidad, { usuario: 'ana', rol: 'VENDEDOR' });
  assert.ok(!JSON.stringify(estados).includes(tokenFicticio));
});

test('identidad usa el rol base si el servidor no envía rolNombre', async () => {
  const { sesion, estados } = arnesSesion((ruta) => ruta === '/auth/login' ? loginValido()
    : Response.json({ usuario: 'ana', roles: ['ROLE_OPERADOR'] }));
  await sesion.entrar('ana', 'prueba');
  assert.equal(estados.at(-1).identidad.rol, 'OPERADOR');
});

test('campos vacíos se validan sin enviar solicitudes', async () => {
  let llamadas = 0;
  const { sesion, estados } = arnesSesion(() => { llamadas += 1; });
  await sesion.entrar('  ', 'prueba');
  await sesion.entrar('ana', '');
  assert.equal(llamadas, 0);
  assert.match(estados.at(-1).mensaje, /Completa el usuario y la contraseña/);
});

test('login diferencia credenciales, configuración, 401 desconocido y 403', async () => {
  const casos = [
    [401, 'credenciales', 'Usuario o contraseña incorrectos.'],
    [401, 'configuracion', 'Error de configuración de la aplicación.'],
    [401, 'desconocido', 'No se pudo iniciar sesión.'],
    [403, '', 'Acceso denegado.'],
  ];
  for (const [status, codigo, mensaje] of casos) {
    const { sesion, estados, credenciales } = arnesSesion(() => Response.json({ codigo }, { status }));
    await sesion.entrar('ana', 'prueba');
    assert.equal(estados.at(-1).mensaje, mensaje);
    assert.equal((credenciales()?.token ?? ''), '');
  }
});

test('red y 5xx muestran servicio no disponible sin publicar detalles privados', async (t) => {
  const consola = ['log', 'warn', 'error', 'info', 'debug'].map((nivel) => t.mock.method(console, nivel, () => {}));
  for (const fetchPrueba of [
    () => { throw new Error(tokenFicticio); },
    () => new Response(tokenFicticio, { status: 502 }),
  ]) {
    const { sesion, estados } = arnesSesion(fetchPrueba);
    await sesion.entrar('ana', 'prueba');
    assert.equal(estados.at(-1).mensaje, 'Servicio no disponible.');
    assert.ok(!JSON.stringify(estados).includes(tokenFicticio));
  }
  assert.ok(consola.every((nivel) => nivel.mock.callCount() === 0));
});

test('expires_in vence con reloj inyectable incluso antes de ejecutarse el temporizador', async () => {
  const { sesion, estados, mover, tarea, credenciales } = arnesSesion(simularSesion);
  await sesion.entrar('ana', 'prueba');
  const primera = credenciales();
  const id = estados.at(-1).id;
  const tareaAnterior = tarea();
  assert.equal(tarea().espera, 2000);
  mover(1999);
  assert.equal((credenciales()?.token ?? ''), tokenFicticio);
  mover(1);
  assert.equal((credenciales()?.token ?? ''), '');
  assert.equal(tarea(), undefined);
  assert.equal(estados.at(-1).mensaje, 'Tu sesión venció. Inicia sesión de nuevo');
  assert.equal(primera.signal.aborted, true);
  assert.equal(estados.at(-1).estado, 'sinSesion');
  await sesion.entrar('ana', 'prueba');
  assert.notEqual(estados.at(-1).id, id);
  tareaAnterior.vencer();
  assert.equal(credenciales().token, tokenFicticio);
  tarea().vencer();
  assert.equal((credenciales()?.token ?? ''), '');
});

test('cerrar sesión borra la identidad y cancela su temporizador', async () => {
  const { sesion, estados, tarea, credenciales } = arnesSesion(simularSesion);
  await sesion.entrar('ana', 'prueba');
  const activa = credenciales();
  sesion.cerrar();
  assert.deepEqual(estados.at(-1), sesionInicial);
  assert.equal(activa.signal.aborted, true);
  assert.equal((credenciales()?.token ?? ''), '');
  assert.equal(tarea(), undefined);
});

test('401 de identidad devuelve al login y 403 conserva sesiones ya abiertas en las consultas', async (t) => {
  const sinIdentidad = arnesSesion((ruta) => ruta === '/auth/login' ? loginValido() : new Response(null, { status: 401 }));
  await sinIdentidad.sesion.entrar('ana', 'prueba');
  assert.equal(sinIdentidad.estados.at(-1).mensaje, mensajeVencida);
  assert.equal((sinIdentidad.credenciales()?.token ?? ''), '');

  let status = 403;
  t.mock.method(globalThis, 'fetch', () => new Response(null, { status }));
  for (const listar of [listarVehiculos, listarVentas]) {
    const { sesion, estados, credenciales } = arnesSesion(simularSesion);
    await sesion.entrar('ana', 'prueba');
    status = 403;
    const resultados = [];
    const consulta = crearConsulta(listar, (resultado) => resultados.push(resultado));
    await cargarConsultaDeSesion(consulta, sesion, estados.at(-1).id);
    assert.match(resultados.at(-1).mensaje, /Acceso denegado/);
    assert.equal((credenciales()?.token ?? ''), tokenFicticio);
    status = 401;
    await cargarConsultaDeSesion(consulta, sesion, estados.at(-1).id);
    assert.equal((credenciales()?.token ?? ''), '');
    assert.equal(estados.at(-1).mensaje, 'Tu sesión venció. Inicia sesión de nuevo');
  }
});


test('cerrar cancela consultas de A; respuestas tardías no repueblan el panel ya abierto para B', async () => {
  const { sesion, estados } = arnesSesion((ruta, opciones) => {
    if (ruta === '/auth/login') {
      const { username } = JSON.parse(opciones.body);
      return Response.json({ access_token: 'ficha-' + username, expires_in: 2 });
    }
    const usuarioActual = opciones.headers.Authorization.replace('Bearer ficha-', '');
    return Response.json({ usuario: usuarioActual, rolNombre: 'OPERADOR' });
  });
  const solicitudes = [];
  const tablero = [];
  const cargar = (tipo) => (token, signal) => {
    const { promise, resolve } = Promise.withResolvers();
    solicitudes.push({ tipo, token, signal, resolve });
    return promise;
  };
  const consultas = (cuenta) => ['ventas', 'vehículos'].map((tipo) =>
    crearConsulta(cargar(tipo), (resultado) => tablero.push({ cuenta, tipo, resultado })));

  await sesion.entrar('cuenta-a', 'prueba');
  const idA = estados.at(-1).id;
  const trabajoA = consultas('A');
  const pendientesA = trabajoA.map((consulta) => cargarConsultaDeSesion(consulta, sesion, idA));
  assert.equal(solicitudes.length, 2);
  sesion.cerrar();
  assert.deepEqual(estados.at(-1), sesionInicial);
  assert.ok(solicitudes.every(({ signal }) => signal.aborted));

  await sesion.entrar('cuenta-b', 'prueba');
  const idB = estados.at(-1).id;
  assert.notEqual(idA, idB);
  assert.equal(sesion.obtenerSesion(idA), null);
  const trabajoB = consultas('B');
  const pendientesB = trabajoB.map((consulta) => cargarConsultaDeSesion(consulta, sesion, idB));
  assert.equal(solicitudes.length, 4);
  assert.deepEqual(solicitudes.map(({ token }) => token),
    ['ficha-cuenta-a', 'ficha-cuenta-a', 'ficha-cuenta-b', 'ficha-cuenta-b']);
  assert.equal(estados.at(-1).identidad.usuario, 'cuenta-b');
  solicitudes[2].resolve(['venta-B']);
  solicitudes[3].resolve(['vehículo-B']);
  await Promise.all(pendientesB);
  solicitudes[0].resolve(['venta-A']);
  solicitudes[1].resolve(['vehículo-A']);
  await Promise.all(pendientesA);
  assert.deepEqual(tablero.filter(({ resultado }) => resultado.estado === 'listo'), [
    { cuenta: 'B', tipo: 'ventas', resultado: { estado: 'listo', datos: ['venta-B'] } },
    { cuenta: 'B', tipo: 'vehículos', resultado: { estado: 'listo', datos: ['vehículo-B'] } },
  ]);
  assert.equal(estados.at(-1).id, idB);
  sesion.cerrar();
});
async function probarProxy(t, remoto, credenciales = {}) {
  const app = crearProxyLogin({
    destino: 'http://127.0.0.1:8090', clientId: 'aplicacion-ficticia', clientSecret: 'dato-ficticio',
    ejecutarFetch: remoto, ...credenciales,
  });
  const server = createServer((req, res) => app(req, res, () => res.writeHead(404).end()));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return async (opciones = {}) => fetch('http://127.0.0.1:' + server.address().port + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ana', password: 'prueba' }), ...opciones,
  });
}

test('middleware añade Basic en Vite y reenvía exclusivamente password grant sin exponer refresh ni credenciales', async (t) => {
  const enviar = await probarProxy(t, (url, opciones) => {
    assert.equal(url.toString(), 'http://127.0.0.1:8090/oauth/token');
    assert.equal(opciones.method, 'POST');
    assert.equal(opciones.redirect, 'error');
    const { Authorization } = opciones.headers;
    assert.ok(Authorization.startsWith('Basic '));
    assert.equal(Buffer.from(Authorization.slice(6), 'base64').toString(), 'aplicacion-ficticia:dato-ficticio');
    assert.deepEqual(Object.fromEntries(opciones.body), { grant_type: 'password', username: 'ana', password: 'prueba' });
    return Response.json({ access_token: tokenFicticio, expires_in: 2, refresh_token: 'otro-dato', scope: 'vehiculos' });
  });
  const r = await enviar({ body: JSON.stringify({ username: 'ana', password: 'prueba', scope: 'ventas:crear' }) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await r.json(), { access_token: tokenFicticio, expires_in: 2 });
});

test('middleware reconoce los dos 401 locales, admite códigos y neutraliza el resto de los cuerpos de Java', async (t) => {
  let caso;
  const enviar = await probarProxy(t, () => caso);
  for (const [respuesta, status, codigo] of [
    [Response.json({ success: false, mensaje: 'Cliente no autorizado' }, { status: 401 }), 401, 'configuracion'],
    [Response.json({ success: false, mensaje: 'USUARIO o contrasena incorrectos.' }, { status: 401 }), 401, 'credenciales'],
    [Response.json({ error: 'invalid_client' }, { status: 401 }), 401, 'configuracion'],
    [new Response(tokenFicticio, { status: 401 }), 401, 'no_autorizado'],
    [new Response(tokenFicticio, { status: 403 }), 403, 'acceso_denegado'],
    [new Response(tokenFicticio, { status: 502 }), 503, 'servicio'],
  ]) {
    caso = respuesta;
    const r = await enviar();
    assert.equal(r.status, status);
    assert.deepEqual(await r.json(), { codigo });
  }
});

test('middleware rechaza otro origen, otro método, tipo incorrecto y falta de configuración', async (t) => {
  let llamadas = 0;
  const enviar = await probarProxy(t, () => { llamadas += 1; }, { clientSecret: '' });
  assert.equal((await enviar({ headers: { Origin: 'http://127.0.0.1:7999', 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await enviar({ headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await enviar({ method: 'GET', body: undefined })).status, 405);
  assert.deepEqual(await (await enviar()).json(), { codigo: 'configuracion' });
  assert.equal(llamadas, 0);
});

test('middleware rechaza tokens con permiso de venta y oculta fallos de conexión', async (t) => {
  let conectar = true;
  const enviar = await probarProxy(t, () => {
    if (!conectar) throw new Error(tokenFicticio);
    return Response.json({ access_token: tokenFicticio, expires_in: 2, scope: 'vehiculos ventas:crear' });
  });
  assert.deepEqual(await (await enviar()).json(), { codigo: 'configuracion' });
  conectar = false;
  assert.deepEqual(await (await enviar()).json(), { codigo: 'servicio' });
});