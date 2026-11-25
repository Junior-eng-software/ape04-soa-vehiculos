import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { crearServidor } from '../server.mjs';

test('login usa Basic del servidor, conserva rechazos y devuelve únicamente el acceso', async (t) => {
  let llamadas = 0;
  const clientePwa = { id: 'cliente-simulado', secreto: 'secreto-simulado' };
  const backend = createServer(async (req, res) => {
    llamadas++;
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    const datos = new URLSearchParams(Buffer.concat(trozos).toString());
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/oauth/token');
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('cliente-simulado:secreto-simulado').toString('base64'));
    assert.deepEqual([...datos.keys()], ['grant_type', 'username', 'password']);
    assert.equal(datos.get('grant_type'), 'password');
    assert.equal(datos.get('username'), 'persona');
    const clave = datos.get('password');
    const estado = { errada: 401, bloqueada: 403, invalida: 200 }[clave] ?? 200;
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(clave === 'invalida' ? {} : {
      access_token: 'token.simulado.firma', token_type: 'bearer',
      expires_in: 1800, refresh_token: 'no-se-reenvia', scope: 'vehiculos ventas:crear',
    }));
  }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolver) => backend.close(resolver)));
  await once(backend, 'listening');
  const apiBase = 'http://127.0.0.1:' + backend.address().port;
  const frontend = crearServidor({ apiBase, clientePwa, directorio: process.cwd() }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolver) => frontend.close(resolver)));
  await once(frontend, 'listening');
  const origen = 'http://127.0.0.1:' + frontend.address().port;
  const login = (body, extra = {}) => fetch(origen + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origen, Authorization: 'Basic del-navegador', ...extra },
    body: JSON.stringify({ username: ' persona ', ...body }),
  });

  const acceso = await login({ password: ' clave con espacios ' });
  assert.equal(acceso.status, 200);
  assert.equal(acceso.headers.get('cache-control'), 'no-store');
  assert.equal(acceso.headers.has('set-cookie'), false);
  assert.deepEqual(await acceso.json(), { access_token: 'token.simulado.firma', expires_in: 1800 });
  assert.equal((await login({ password: 'errada' })).status, 401);
  assert.equal((await login({ password: 'bloqueada' })).status, 403);
  assert.equal((await login({ password: 'invalida' })).status, 502);
  assert.equal((await login({ password: 'prueba', client_id: 'otro' })).status, 400);
  assert.equal((await login({ password: 'prueba' }, { Origin: 'https://ajeno.test' })).status, 403);
  assert.equal((await login({ password: 'prueba' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await login({ password: 'a'.repeat(9000) })).status, 413);
  assert.equal((await fetch(origen + '/api/login')).status, 405);
  assert.equal((await fetch(origen + '/.env')).status, 404);
  assert.equal(llamadas, 4);
});

// Prueba de integración local: dos servidores de prueba en puertos aleatorios.
test('proxy reenvía Bearer y respuesta HTTP del backend', async () => {
  let jwt = '';
  const backend = createServer((req, res) => {
    jwt = req.headers.authorization;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const port = backend.address().port;
  const frontend = crearServidor({ apiBase: `http://127.0.0.1:${port}` });
  frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  try {
    const respuesta = await fetch(`http://127.0.0.1:${frontend.address().port}/api/vehiculos`, {
      headers: { Authorization: 'Bearer prueba.jwt' },
    });
    assert.equal(respuesta.status, 200);
    assert.equal(jwt, 'Bearer prueba.jwt');
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await respuesta.json(), []);
  } finally {
    await new Promise((r) => frontend.close(r));
    await new Promise((r) => backend.close(r));
  }
});

test('proxy de administración limita rutas, métodos, origen, tipo y tamaño', async (t) => {
  const token = crypto.randomUUID();
  const llamadas = [];
  const backend = createServer(async (req, res) => {
    const trozos = [];
    for await (const trozo of req) trozos.push(trozo);
    llamadas.push([req.method, req.url, req.headers.authorization, req.headers['content-type'],
      Buffer.concat(trozos).toString()]);
    const estado = req.method === 'PUT' ? 204 : req.method === 'POST' ? 201 : 200;
    res.writeHead(estado, { 'Content-Type': 'application/json' });
    res.end(estado === 204 ? undefined : '{}');
  }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolver) => backend.close(resolver)));
  await once(backend, 'listening');
  const frontend = crearServidor({ apiBase: 'http://127.0.0.1:' + backend.address().port }).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolver) => frontend.close(resolver)));
  await once(frontend, 'listening');
  const origen = 'http://127.0.0.1:' + frontend.address().port;
  const bearer = 'Bearer ' + token;
  const tipo = 'application/json; charset=utf-8';
  const pedir = (ruta, method = 'GET', body, encabezados = {}) => fetch(origen + ruta, {
    method, body, headers: { Authorization: bearer, Origin: origen,
      ...(body !== undefined && { 'Content-Type': tipo }), ...encabezados },
  });
  const rol = JSON.stringify({ nombre: 'VENDEDOR', rolBase: 'OPERADOR', descripcion: '' });
  const clave = JSON.stringify({ clave: crypto.randomUUID() });
  const usuario = JSON.stringify({ ...JSON.parse(clave), username: 'vendedor_demo', rol: 'VENDEDOR' });

  for (const ruta of ['/api/identidad', '/api/usuarios', '/api/roles']) {
    const respuesta = await pedir(ruta);
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
    assert.equal(respuesta.headers.get('vary'), 'Authorization');
  }
  assert.equal((await pedir('/api/roles', 'POST', rol)).status, 201);
  assert.equal((await pedir('/api/usuarios', 'POST', usuario)).status, 201);
  assert.equal((await pedir('/api/usuarios/1/clave', 'PUT', clave)).status, 204);
  const denegado = await pedir('/api/roles', 'DELETE');
  assert.equal(denegado.status, 405);
  assert.equal(denegado.headers.get('allow'), 'GET, POST');
  assert.equal((await pedir('/api/roles/ADMIN', 'DELETE')).status, 404);
  assert.equal((await pedir('/api/usuarios/2147483648/clave', 'PUT', clave)).status, 400);
  assert.equal((await pedir('/api/roles', 'POST', rol, { Origin: 'https://ajeno.test' })).status, 403);
  assert.equal((await pedir('/api/usuarios', 'GET', undefined, { Origin: 'null' })).status, 403);
  assert.equal((await pedir('/api/usuarios/1/clave', 'PUT', clave, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await pedir('/api/roles', 'POST', 'x'.repeat(8193))).status, 413);
  assert.deepEqual(llamadas.slice(0, 3).map(([method, ruta, auth]) => [method, ruta, auth]),
    ['/api/identidad', '/api/usuarios', '/api/roles'].map((ruta) => ['GET', ruta, bearer]));
  assert.deepEqual(llamadas.slice(3).map(([method, ruta, auth, contentType]) => [method, ruta, auth, contentType]), [
    ['POST', '/api/roles', bearer, tipo], ['POST', '/api/usuarios', bearer, tipo],
    ['PUT', '/api/usuarios/1/clave', bearer, tipo],
  ]);
  assert.ok(llamadas[3][4] === rol && llamadas[4][4] === usuario && llamadas[5][4] === clave);
});
