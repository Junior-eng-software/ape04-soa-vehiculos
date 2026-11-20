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
