import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorAcceso, iniciarSesion, listarVehiculos, normalizarToken } from '../public/api.js';
import { crearSesion } from '../public/sesion.js';

test('acceso envía solo credenciales personales y conserva el JWT en memoria hasta cierre o caducidad', async () => {
  let reloj = 1000;
  const sesion = crearSesion(() => reloj);
  const { jwt, segundos } = await iniciarSesion('persona', 'clave simulada', async (ruta, opciones) => {
    assert.equal(ruta, '/api/login');
    assert.equal(opciones.method, 'POST');
    assert.equal(opciones.cache, 'no-store');
    assert.deepEqual(JSON.parse(opciones.body), { username: 'persona', password: 'clave simulada' });
    return Response.json({ access_token: 'token.simulado.firma', expires_in: 5 });
  });
  sesion.guardar(jwt, segundos);
  assert.equal(sesion.leer(), jwt);
  sesion.cerrar();
  assert.equal(sesion.leer(), null);
  sesion.guardar(jwt, segundos);
  reloj = 5999;
  assert.equal(sesion.leer(), jwt);
  reloj = 6000;
  assert.equal(sesion.leer(), null);
});

test('acceso distingue HTTP, cuerpo inválido y error de transporte sin incluir detalles privados', async () => {
  for (const estado of [400, 401, 403, 500, 502, 503, 504]) {
    await assert.rejects(iniciarSesion('persona', 'clave', async () => new Response('privado', { status: estado })),
      (error) => error instanceof ErrorAcceso && error.message.startsWith('HTTP ' + estado)
        && !error.message.includes('privado'));
  }
  for (const respuesta of [new Response(), new Response('privado'), Response.json({ access_token: 'invalido' })]) {
    await assert.rejects(iniciarSesion('persona', 'clave', async () => respuesta), /respuesta de acceso inválida/);
  }
  await assert.rejects(iniciarSesion('persona', 'clave', async () => { throw new Error('privado'); }),
    /No se pudo conectar/);
});

test('acceso cancela una respuesta con cuerpo detenido y muestra el tiempo agotado', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const acceso = iniciarSesion('persona', 'clave simulada', async (_ruta, { signal }) => ({
    status: 200,
    json: () => new Promise((_, rechazar) => {
      signal.addEventListener('abort', () => rechazar(signal.reason), { once: true });
    }),
  }));
  await Promise.resolve();
  t.mock.timers.tick(15000);
  await assert.rejects(acceso, /no respondió a tiempo/);
});

// Los datos de estas pruebas son simulados y no sustituyen a la API real.
test('normaliza un token pegado con prefijo Bearer', () => {
  assert.equal(normalizarToken('  bearer abc.def.ghi  '), 'abc.def.ghi');
});

test('GET transmite Authorization y recibe una lista JSON', async () => {
  let solicitud;
  const simularFetch = async (ruta, opciones) => {
    solicitud = { ruta, opciones };
    return new Response(JSON.stringify([{ idVehiculo: 1, marca: 'Ejemplo' }]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  const resultado = await listarVehiculos('mi.token', simularFetch);
  assert.equal(solicitud.ruta, '/api/vehiculos');
  assert.equal(solicitud.opciones.headers.get('Authorization'), 'Bearer mi.token');
  assert.equal(solicitud.opciones.cache, 'no-store');
  assert.equal(resultado.vehiculos.length, 1);
});

test('sin token no agrega Authorization (el backend decide 401)', async () => {
  const simularFetch = async (_ruta, opciones) => {
    assert.equal(opciones.headers.has('Authorization'), false);
    return new Response('[]', { status: 200 });
  };
  await listarVehiculos('', simularFetch);
});

test('identifica HTTP 401 sin mostrar una lista inventada', async () => {
  await assert.rejects(
    listarVehiculos('vencido', async () => new Response('No autorizado', { status: 401 })),
    (error) => error.codigoHttp === 401 && /401/.test(error.message),
  );
});

test('rechaza un objeto en lugar del arreglo JSON contratado', async () => {
  await assert.rejects(
    listarVehiculos('jwt', async () => new Response('{"data":[]}', { status: 200 })),
    /arreglo JSON/,
  );
});

test('informa error de conectividad', async () => {
  await assert.rejects(
    listarVehiculos('jwt', async () => { throw new Error('sin red'); }),
    /conectar/,
  );
});
