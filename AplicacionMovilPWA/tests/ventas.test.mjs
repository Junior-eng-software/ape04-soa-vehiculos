import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { crearServidor } from '../server.mjs';
import { anularVenta, consultarVenta, crearRegistroVenta, listarCompradores, listarVentas, registrarVenta } from '../public/ventas.js';

const seleccion = { vehiculoId: 7, compradorId: 3 };
const venta = {
  id: 19, ...seleccion, estado: 'COMPLETADA', precioAcordado: '12345.60', moneda: 'USD',
};
const detalleVenta = { ...venta, fechaUTC: '2026-11-20T23:26:47Z' };
const clave = 'clave-simulada-2026';

async function escuchar(servidor, t) {
  servidor.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolver) => servidor.close(resolver)));
  await once(servidor, 'listening');
  return 'http://127.0.0.1:' + servidor.address().port;
}

test('proxy y cliente mantienen el contrato, la autorización y la idempotencia del backend simulado', async (t) => {
  const registros = new Map();
  const backend = createServer(async (req, res) => {
    function enviar(codigo, cuerpo, extras = {}) {
      res.writeHead(codigo, { 'Content-Type': 'application/json', ...extras });
      res.end(JSON.stringify(cuerpo));
    }
    assert.equal(req.headers['x-service-key'], undefined);
    if (req.url === '/api/compradores') {
      assert.equal(req.method, 'GET');
      return req.headers.authorization === 'Bearer operador-simulado'
        ? enviar(200, [{ id: 3, nombre: 'Comprador simulado' }])
        : enviar(403, { codigo: 'SIN_PERMISO' });
    }
    assert.equal(req.url, '/api/ventas');
    assert.equal(req.method, 'POST');
    assert.match(req.headers['content-type'], /^application\/json/);
    const partes = [];
    for await (const parte of req) partes.push(parte);
    const datos = JSON.parse(Buffer.concat(partes).toString());
    assert.deepEqual(Object.keys(datos).sort(), ['compradorId', 'vehiculoId']);
    const token = req.headers.authorization;
    if (token === 'Bearer vencido-simulado') return enviar(401, { codigo: 'NO_AUTENTICADO' });
    if (token === 'Bearer consulta-simulado' || datos.compradorId === 4) {
      return enviar(403, { codigo: 'SIN_PERMISO' });
    }
    if (!Number.isInteger(datos.vehiculoId)) return enviar(422, { codigo: 'VALIDACION' });
    const recibida = req.headers['idempotency-key'];
    assert.match(recibida, /^[A-Za-z0-9_-]{8,100}$/);
    const anterior = registros.get(recibida);
    if (anterior && JSON.stringify(anterior) !== JSON.stringify(datos)) {
      return enviar(409, { codigo: 'CLAVE_REUTILIZADA' });
    }
    if (datos.vehiculoId === 8) return enviar(409, { codigo: 'VENTA_RECHAZADA' });
    registros.set(recibida, datos);
    return enviar(anterior ? 200 : 201, venta, { Location: '/api/ventas/19' });
  });
  const apiBase = await escuchar(backend, t);
  const frontend = await escuchar(crearServidor({ apiBase }), t);
  const descargar = async (ruta, opciones) => {
    const headers = new Headers(opciones.headers);
    headers.set('Origin', frontend);
    headers.set('X-Service-Key', 'no-se-reenvia');
    const respuesta = await fetch(frontend + ruta, { ...opciones, headers });
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    return respuesta;
  };

  const jwt = 'operador-simulado';
  assert.deepEqual(await listarCompradores(jwt, undefined, descargar), [{ id: 3, nombre: 'Comprador simulado' }]);
  await assert.rejects(listarCompradores('consulta-simulado', undefined, descargar), { codigoHttp: 403 });
  const post = (datos, token = jwt) => registrarVenta(token, datos, clave, undefined, descargar);
  for (const [datos, token, codigo] of [
    [seleccion, 'consulta-simulado', 403],
    [{ ...seleccion, compradorId: 4 }, jwt, 403],
    [seleccion, 'vencido-simulado', 401],
    [{ ...seleccion, vehiculoId: 8 }, jwt, 409],
    [{ ...seleccion, vehiculoId: '7' }, jwt, 422],
  ]) {
    await assert.rejects(post(datos, token), { codigoHttp: codigo, incierto: false });
  }
  assert.equal(registros.size, 0);

  assert.deepEqual(await post(seleccion), { codigoHttp: 201, venta });
  assert.deepEqual(await post(seleccion), { codigoHttp: 200, venta });
  await assert.rejects(post({ ...seleccion, vehiculoId: 9 }), /HTTP 409: La clave de idempotencia/);
  assert.equal(registros.size, 1);

  const respuesta = await descargar('/api/ventas', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json', 'Idempotency-Key': clave },
    body: JSON.stringify(seleccion),
  });
  assert.equal(respuesta.headers.get('location'), '/api/ventas/19');
  await respuesta.json();
  const externo = await fetch(frontend + '/api/ventas', { method: 'POST', headers: { Origin: 'https://ajeno.test' } });
  assert.equal(externo.status, 403);
});

test('doble clic, timeout y reintento conservan el cuerpo y una única clave', async () => {
  const envios = [];
  let habilitar;
  const puerta = new Promise((resolver) => { habilitar = resolver; });
  const registro = crearRegistroVenta((jwt, datos, id, signal) => registrarVenta(
    jwt, datos, id, signal, async (_url, opciones) => {
      envios.push([opciones.headers['Idempotency-Key'], opciones.body]);
      if (envios.length === 1) {
        await puerta;
        return new Response(null, { status: 504 });
      }
      return Response.json(venta);
    },
  ), () => clave);
  const primero = registro.registrar('operador-simulado', seleccion);
  assert.equal(await registro.registrar('operador-simulado', seleccion), null);
  habilitar();
  await assert.rejects(primero, { codigoHttp: 504, incierto: true });
  assert.equal(registro.pendiente(), true);
  await assert.rejects(registro.registrar('operador-simulado', { ...seleccion, vehiculoId: 9 }), /el mismo vehículo/);
  assert.deepEqual(await registro.registrar('operador-simulado', seleccion), { codigoHttp: 200, venta });
  assert.deepEqual(envios, [[clave, JSON.stringify(seleccion)], [clave, JSON.stringify(seleccion)]]);
  assert.equal(registro.pendiente(), false);
});

test('202 conserva la operación y un 401 posterior permite advertir antes de limpiar la sesión', async () => {
  let codigo = 202;
  const pendiente = { ...venta, estado: 'EN_REVISION', precioAcordado: null, moneda: null };
  const claves = [];
  const registro = crearRegistroVenta((jwt, datos, id, signal) => registrarVenta(jwt, datos, id, signal,
    async (_ruta, opciones) => {
      claves.push(opciones.headers['Idempotency-Key']);
      return Response.json(codigo === 202 ? pendiente : {}, { status: codigo });
    }));
  assert.deepEqual(await registro.registrar('operador-simulado', seleccion), { codigoHttp: 202, venta: pendiente });
  const detalle = { ...detalleVenta, ...pendiente };
  assert.deepEqual(await consultarVenta('operador-simulado', pendiente.id, undefined, async (ruta, opciones) => {
    assert.equal(ruta, '/api/ventas/19');
    assert.equal(opciones.headers['Idempotency-Key'], undefined);
    return Response.json(detalle);
  }), detalle);
  assert.equal(registro.pendiente(), true);
  codigo = 401;
  await assert.rejects(registro.registrar('vencido-simulado', seleccion), { codigoHttp: 401 });
  assert.equal(claves[0], claves[1]);
  assert.match(claves[0], /^[A-Za-z0-9_-]{8,100}$/);
  assert.equal(registro.pendiente(), true);
  registro.limpiar();
  assert.equal(registro.pendiente(), false);
});

test('GET individual reenvía Bearer y conserva la decisión de propietario o ADMIN', async (t) => {
  let llamadas = 0;
  const apiBase = await escuchar(createServer((req, res) => {
    llamadas++;
    assert.equal(req.method, 'GET');
    for (const nombre of ['x-service-key', 'x-role', 'idempotency-key']) {
      assert.equal(req.headers[nombre], undefined);
    }
    const token = req.headers.authorization;
    const codigo = !token || token === 'Bearer vencido-simulado' ? 401
      : req.url === '/api/ventas/999' ? 404
      : ['Bearer propietario-simulado', 'Bearer admin-simulado'].includes(token) ? 200 : 403;
    assert.match(req.url, /^\/api\/ventas\/(19|999)$/);
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(codigo === 200 ? detalleVenta : { codigo: 'error-simulado' }));
  }), t);
  const frontend = await escuchar(crearServidor({ apiBase }), t);
  const descargar = async (ruta, opciones) => {
    const headers = new Headers(opciones.headers);
    headers.set('X-Service-Key', 'ignorar');
    headers.set('X-Role', 'ADMIN');
    headers.set('Idempotency-Key', clave);
    const respuesta = await fetch(frontend + ruta, { ...opciones, headers });
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(respuesta.headers.get('vary'), 'Authorization');
    return respuesta;
  };

  for (const token of ['propietario-simulado', 'admin-simulado']) {
    assert.deepEqual(await consultarVenta(token, 19, undefined, descargar), detalleVenta);
  }
  await assert.rejects(consultarVenta('ajeno-simulado', 19, undefined, descargar), { codigoHttp: 403 });
  await assert.rejects(consultarVenta('vencido-simulado', 19, undefined, descargar), { codigoHttp: 401 });
  await assert.rejects(consultarVenta('admin-simulado', 999, undefined, descargar), { codigoHttp: 404 });
  assert.equal((await fetch(frontend + '/api/ventas/19')).status, 401);
  for (const ruta of ['/api/ventas/0', '/api/ventas/-3', '/api/ventas/x', '/api/ventas/9007199254740992']) {
    assert.equal((await fetch(frontend + ruta)).status, 400);
  }
  assert.equal((await fetch(frontend + '/api/ventas/19/interna')).status, 404);
  assert.equal((await fetch(frontend + '/api/ventas/19', { method: 'POST' })).status, 404);
  assert.equal(llamadas, 6);
});

test('proxy reenvía el filtro de anuladas y las respuestas 202 y 204 de DELETE', async (t) => {
  const token = crypto.randomUUID();
  let estado = 'COMPLETADA';
  const llamadas = [];
  const backend = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    llamadas.push([req.method, req.url]);
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(estado !== 'ANULADA' || req.url.endsWith('?incluirAnuladas=true')
        ? [{ ...detalleVenta, estado }] : []));
    }
    assert.equal(req.url, '/api/ventas/19');
    if (estado === 'COMPLETADA') {
      estado = 'ANULANDO';
      res.writeHead(202, { Location: '/api/ventas/19' });
    } else {
      estado = 'ANULADA';
      res.writeHead(204);
    }
    res.end();
  });
  const apiBase = await escuchar(backend, t);
  const origen = await escuchar(crearServidor({ apiBase }), t);
  const descargar = (ruta, opciones) => fetch(origen + ruta, opciones);
  assert.equal((await fetch(origen + '/api/ventas/19', { method: 'DELETE', headers: { Origin: 'https://ajeno.test' } })).status, 403);
  assert.equal((await fetch(origen + '/api/ventas/19', { method: 'DELETE', body: '{}' })).status, 400);
  assert.equal((await fetch(origen + '/api/ventas/-2', { method: 'DELETE' })).status, 400);
  assert.equal(await anularVenta(token, 19, undefined, descargar), 202);
  assert.equal((await listarVentas(token, false, undefined, descargar))[0].estado, 'ANULANDO');
  assert.equal(await anularVenta(token, 19, undefined, descargar), 204);
  assert.deepEqual(await listarVentas(token, false, undefined, descargar), []);
  assert.equal((await listarVentas(token, true, undefined, descargar))[0].estado, 'ANULADA');
  assert.deepEqual(llamadas, [
    ['DELETE', '/api/ventas/19'], ['GET', '/api/ventas'], ['DELETE', '/api/ventas/19'],
    ['GET', '/api/ventas'], ['GET', '/api/ventas?incluirAnuladas=true'],
  ]);
});

test('consulta reconoce todos los estados y conserva importe decimal y nulos', async () => {
  for (const estado of ['COMPLETADA', 'EN_REVISION', 'FALLIDA', 'PENDIENTE']) {
    const esperado = estado === 'COMPLETADA' ? detalleVenta
      : { ...detalleVenta, estado, precioAcordado: null, moneda: null };
    assert.deepEqual(await consultarVenta('jwt-simulado', '19', undefined,
      async () => Response.json(esperado)), esperado);
  }
  for (const id of ['', '19/otras', '1e2', '0', '9007199254740992']) {
    await assert.rejects(consultarVenta('jwt-simulado', id, undefined, async () => {
      assert.fail('El ID inválido no debe enviarse');
    }), /ID de venta entero y positivo/);
  }
  for (const datos of [null, { ...detalleVenta, id: 20 }, { ...detalleVenta, estado: 'DESCONOCIDO' }]) {
    await assert.rejects(consultarVenta('jwt-simulado', 19, undefined,
      async () => Response.json(datos)), /datos esperados/);
  }
});

test('consulta distingue indisponibilidad, errores de red, timeout y cancelación', async (t) => {
  for (const codigo of [502, 503, 504]) {
    await assert.rejects(consultarVenta('jwt-simulado', 19, undefined,
      async () => new Response(null, { status: codigo })), {
      codigoHttp: codigo, message: codigo === 504 ? /tiempo de espera/ : /no disponible/,
    });
  }
  await assert.rejects(consultarVenta('jwt-simulado', 19, undefined, async () => {
    throw new TypeError('Conexión interrumpida');
  }), /fallo de conexión/);

  const timeout = AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal, 'timeout', () => timeout(20));
  const esperarAborto = async (_ruta, { signal }) => {
    await new Promise((resolver) => setTimeout(resolver, 100));
    signal.throwIfAborted();
  };
  await assert.rejects(consultarVenta('jwt-simulado', 19, undefined, esperarAborto), /tiempo de espera/);

  const actual = new AbortController();
  const consulta = consultarVenta('jwt-simulado', 19, actual.signal, async (_ruta, { signal }) => {
    await once(signal, 'abort');
    signal.throwIfAborted();
  });
  actual.abort();
  await assert.rejects(consulta, /fallo de conexión/);
});

test('clasifica errores definitivos, fallos de red y respuestas inesperadas', async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    await assert.rejects(registrarVenta('jwt-simulado', seleccion, clave, undefined,
      async () => new Response(null, { status })), { codigoHttp: status, incierto: false });
  }
  await assert.rejects(registrarVenta('jwt-simulado', seleccion, clave, undefined, async () => {
    throw new TypeError('Error de red simulado');
  }), { incierto: true });
  await assert.rejects(registrarVenta('jwt-simulado', seleccion, clave, undefined,
    async () => new Response('{}', { status: 201 })), { codigoHttp: 201, incierto: true });
  await assert.rejects(registrarVenta('jwt-simulado', seleccion, clave, undefined,
    async () => Response.json({ ...venta, precioAcordado: 12345.60 })), { codigoHttp: 200, incierto: true });
  await assert.rejects(registrarVenta('jwt-simulado', seleccion, clave, undefined,
    async () => new Response(null, { status: 502 })), { codigoHttp: 502, incierto: true });
});
