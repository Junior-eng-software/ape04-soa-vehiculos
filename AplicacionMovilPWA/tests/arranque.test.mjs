import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const recurso = (archivo) => readFile(new URL('../public/' + archivo, import.meta.url), 'utf8');

test('Service Worker instala una versión coherente y deja pasar solicitudes protegidas', async () => {
  const origen = 'http://localhost';
  const eventos = {};
  let instalados;
  const eliminados = [];
  const cache = {
    addAll: async (solicitudes) => { instalados = solicitudes; },
    match: async (solicitud) => solicitud,
  };
  runInNewContext(await recurso('sw.js'), {
    URL, Request, Response,
    self: {
      location: { origin: origen }, clients: { claim: () => {} }, skipWaiting: () => {},
      addEventListener: (nombre, listener) => { eventos[nombre] = listener; },
    },
    caches: {
      open: async (nombre) => { assert.equal(nombre, 'vehiculos-pwa-v8'); return cache; },
      keys: async () => ['vehiculos-pwa-v7', 'vehiculos-pwa-v8', 'otra-app'],
      delete: async (nombre) => { eliminados.push(nombre); },
    },
  });

  let tarea;
  eventos.install({ waitUntil: (promesa) => { tarea = promesa; } });
  await tarea;
  const urls = new Set(Array.from(instalados, (solicitud) => solicitud.url));
  assert.ok(instalados.every((solicitud) => solicitud.cache === 'reload'));
  const html = await recurso('index.html');
  const entrada = html.match(/import\('([^']+)'\)/)[1];
  assert.ok(urls.has(origen + entrada));
  assert.ok(urls.has(origen + html.match(/href="(\/styles\.css[^"]+)"/)[1]));
  const main = await recurso('main.js');
  for (const [, modulo] of main.matchAll(/from '([^']+)'/g)) {
    assert.ok(urls.has(new URL(modulo, origen + entrada).href));
  }
  eventos.activate({ waitUntil: (promesa) => { tarea = promesa; } });
  await tarea;
  assert.deepEqual(eliminados, ['vehiculos-pwa-v7']);

  for (const [ruta, opciones] of [
    ['/api/login', { method: 'POST' }], ['/api/ventas/19'], ['/ventas.js?v=4'],
    ['/ventas.js?v=5', { headers: { Authorization: 'Bearer simulado' } }],
  ]) {
    eventos.fetch({ request: new Request(origen + ruta, opciones), respondWith: () => assert.fail(ruta) });
  }
  const solicitud = new Request(origen + '/ventas.js?v=5');
  eventos.fetch({ request: solicitud, respondWith: (promesa) => { tarea = promesa; } });
  assert.equal(await tarea, solicitud);
});

test('controlador conserva la sesión, separa compradores homónimos y bloquea la limpieza de ventas inciertas', async (t) => {
  const html = await recurso('index.html');
  const controles = new Map(Array.from(html.matchAll(/\bid="([\w-]+)"/g), ([, id]) => [id, {
    value: '', eventos: {}, options: [], hijos: [], reset() {}, focus() {},
    append(...hijos) { this.hijos.push(...hijos); },
    replaceChildren(...opciones) { this.options = opciones; this.hijos = []; this.value = ''; },
    get selectedOptions() { return this.options.filter((opcion) => opcion.value === this.value); },
    addEventListener(nombre, listener) { this.eventos[nombre] = listener; },
  }]));
  const buscar = (id) => controles.get(id);
  const globales = { document: { querySelector: (selector) => buscar(selector.slice(1)), createElement: () => ({
    hijos: [], append(...hijos) { this.hijos.push(...hijos); },
  }) },
    window: { addEventListener() {} }, Option: class {
      constructor(texto, valor) { this.text = texto; this.value = valor; }
      remove() {
        const selector = buscar('vehiculo-venta');
        selector.options = selector.options.filter((opcion) => opcion !== this);
      }
    } };
  for (const [nombre, valor] of Object.entries(globales)) {
    globalThis[nombre] = valor;
    t.after(() => { delete globalThis[nombre]; });
  }
  const fetchSimulado = t.mock.method(globalThis, 'fetch', () => Response.json({}, { status: 401 }));
  await import('../public/main.js?v=8');
  const enviar = () => {
    buscar('usuario').value = 'persona';
    buscar('clave').value = 'clave simulada';
    return buscar('formulario').eventos.submit({ preventDefault() {} });
  };

  const rechazado = enviar();
  assert.match(buscar('mensaje').textContent, /Iniciando sesión/);
  assert.equal(buscar('ingresar').disabled, true);
  await rechazado;
  assert.match(buscar('mensaje').textContent, /Usuario o contraseña no válidos/);
  assert.equal(buscar('ingresar').disabled, false);

  fetchSimulado.mock.mockImplementation(() => Response.json({ access_token: 'token.simulado.firma', expires_in: 5 }));
  t.mock.method(buscar('actualizar-listas'), 'focus', () => { throw new Error('detalle interno de prueba'); });
  await enviar();
  assert.match(buscar('mensaje').textContent, /No se pudo iniciar la sesión en la aplicación/);
  assert.equal(buscar('panel-acceso').hidden, false);
  assert.equal(buscar('panel-estado-venta').hidden, true);
  assert.equal(buscar('ingresar').disabled, false);

  t.mock.restoreAll();
  const envios = [];
  const lecturasEstado = [];
  const rutas = [];
  let modoListas = 'parcial';
  let resolverVehiculos;
  let resolverCompradores;
  const esperaVehiculos = new Promise((resolver) => { resolverVehiculos = resolver; });
  const esperaCompradores = new Promise((resolver) => { resolverCompradores = resolver; });
  let terminarActualizacion;
  const esperaCierre = new Promise((resolver) => { terminarActualizacion = resolver; });
  const vehiculos = [
    { idVehiculo: 44, marca: 'Marca', modelo: 'Uno', estado: 'DISPONIBLE' },
    { idVehiculo: 45, marca: 'Marca', modelo: 'Dos', estado: 'DISPONIBLE' },
    { idVehiculo: 46, marca: 'Marca', modelo: 'Tres', estado: 'VENDIDO' },
    ...Array.from({ length: 20 }, (_, index) => ({
      idVehiculo: 100 + index, marca: 'Otra', modelo: 'Común', estado: 'VENDIDO',
    })),
  ];
  let catalogoRespuesta = vehiculos;
  const generarClave = t.mock.method(crypto, 'randomUUID');
  t.mock.method(globalThis, 'fetch', async (ruta, opciones) => {
    rutas.push(ruta);
    if (ruta === '/api/login') return Response.json({ access_token: 'token.simulado.firma', expires_in: 5 });
    if (modoListas === 'cerrando') await esperaCierre;
    if (ruta === '/api/vehiculos') {
      assert.equal(opciones.headers.get('Authorization'), 'Bearer token.simulado.firma');
      if (modoListas === 'parcial') await esperaVehiculos;
      return Response.json(catalogoRespuesta);
    }
    assert.equal(opciones.headers.Authorization, 'Bearer token.simulado.firma');
    if (ruta === '/api/compradores') {
      if (modoListas === 'parcial') {
        await esperaCompradores;
        return new Response(null, { status: 503 });
      }
      return Response.json(modoListas === 'vacío' ? [] : [1, 2].map((id) => ({ id, nombre: 'Nombre igual' })));
    }
    if (ruta === '/api/ventas/19') {
      lecturasEstado.push(ruta);
      return Response.json({ id: 19, ...JSON.parse(envios.at(-1).cuerpo), estado: 'COMPLETADA',
        fechaUTC: '2026-11-20T02:00:00Z', precioAcordado: null, moneda: null });
    }
    assert.equal(ruta, '/api/ventas');
    envios.push({ clave: opciones.headers['Idempotency-Key'], cuerpo: opciones.body });
    const numero = envios.length;
    if (numero === 2) return new Response(null, { status: 504 });
    return Response.json({ id: 19, ...JSON.parse(opciones.body),
      estado: numero === 1 ? 'EN_REVISION' : 'COMPLETADA', precioAcordado: null, moneda: null,
    }, { status: numero === 1 ? 202 : numero === 3 ? 200 : 201 });
  });
  const vehiculo = buscar('vehiculo-venta');
  const comprador = buscar('comprador-venta');
  const limpiar = buscar('limpiar-seleccion');
  const acceso = enviar();
  await new Promise((resolver) => setImmediate(resolver));
  assert.deepEqual(rutas, ['/api/login', '/api/vehiculos', '/api/compradores']);
  assert.deepEqual([vehiculo.options[0].text, comprador.options[0].text], ['Cargando...', 'Cargando...']);
  resolverCompradores();
  await new Promise((resolver) => setImmediate(resolver));
  assert.match(buscar('estado-lista-compradores').textContent, /Actualizar listas/);
  assert.equal(vehiculo.options[0].text, 'Cargando...');
  resolverVehiculos();
  await acceso;
  assert.equal(buscar('panel-estado-venta').hidden, false);
  assert.deepEqual(vehiculo.options.map(({ value }) => value), ['', '44', '45']);
  assert.match(buscar('estado-lista-vehiculos').textContent, /2 vehículos disponibles/);

  const actualizar = buscar('actualizar-listas').eventos.click;
  const marca = buscar('filtro-marca');
  const modelo = buscar('filtro-modelo');
  const estado = buscar('filtro-estado');
  const tarjetas = buscar('vehiculos');
  const mas = buscar('mostrar-mas');
  const cambiar = (selector, valor) => {
    selector.value = valor;
    selector.eventos.change();
  };
  const solicitudesAntes = rutas.length;
  assert.deepEqual(marca.options.map(({ value }) => value), ['', 'Marca', 'Otra']);
  assert.deepEqual(estado.options.map(({ value }) => value), ['', 'DISPONIBLE', 'VENDIDO']);
  assert.equal(buscar('contador').textContent, '23 coincidencias');
  assert.equal(tarjetas.hijos.length, 10);
  mas.eventos.click();
  assert.equal(tarjetas.hijos.length, 20);
  mas.eventos.click();
  assert.equal(tarjetas.hijos.length, 23);
  assert.equal(mas.hidden, true);
  cambiar(marca, 'Marca');
  assert.deepEqual(modelo.options.map(({ value }) => value), ['', 'Dos', 'Tres', 'Uno']);
  cambiar(modelo, 'Uno');
  cambiar(estado, 'VENDIDO');
  assert.equal(buscar('contador').textContent, '0 coincidencias');
  assert.match(tarjetas.hijos[0].textContent, /Ningún vehículo coincide/);
  cambiar(modelo, 'Tres');
  assert.equal(buscar('contador').textContent, '1 coincidencia');
  cambiar(marca, 'Otra');
  assert.equal(modelo.value, '');
  assert.deepEqual(modelo.options.map(({ value }) => value), ['', 'Común']);
  assert.equal(buscar('contador').textContent, '20 coincidencias');
  assert.equal(tarjetas.hijos.length, 10);
  buscar('limpiar-filtros').eventos.click();
  assert.deepEqual([marca.value, modelo.value, estado.value], ['', '', '']);
  assert.equal(buscar('contador').textContent, '23 coincidencias');
  assert.equal(rutas.length, solicitudesAntes);
  assert.deepEqual(vehiculo.options.map(({ value }) => value), ['', '44', '45']);

  cambiar(marca, 'Marca');
  cambiar(modelo, 'Dos');
  cambiar(estado, 'DISPONIBLE');
  await actualizar();
  assert.deepEqual([marca.value, modelo.value, estado.value], ['Marca', 'Dos', 'DISPONIBLE']);
  catalogoRespuesta = vehiculos.filter(({ idVehiculo }) => idVehiculo !== 45);
  await actualizar();
  assert.deepEqual([marca.value, modelo.value, estado.value], ['Marca', '', 'DISPONIBLE']);
  assert.ok(!modelo.options.some(({ value }) => value === 'Dos'));
  catalogoRespuesta = vehiculos;
  modoListas = 'vacío';
  await actualizar();
  assert.match(buscar('estado-lista-compradores').textContent, /Windows Forms/);
  modoListas = 'normal';
  await actualizar();
  assert.deepEqual([vehiculo.value, comprador.value], ['', '']);
  assert.deepEqual(comprador.options.slice(1).map(({ text, value }) => [text, value]), [
    ['Nombre igual (ID 1)', '1'], ['Nombre igual (ID 2)', '2'],
  ]);

  const seleccionar = (vehiculoId, compradorId) => {
    vehiculo.value = vehiculoId;
    comprador.value = compradorId;
    comprador.eventos.change();
  };
  seleccionar('44', '1');
  assert.equal(limpiar.disabled, false);
  limpiar.eventos.click();
  assert.deepEqual([vehiculo.value, comprador.value], ['', '']);
  assert.equal(generarClave.mock.callCount(), 0);

  seleccionar('44', '2');
  const registrar = () => buscar('formulario-venta').eventos.submit({ preventDefault() {} });
  const pendiente = registrar();
  assert.ok(limpiar.disabled && vehiculo.disabled && comprador.disabled);
  limpiar.eventos.click();
  await pendiente;
  assert.ok(limpiar.disabled && vehiculo.disabled && comprador.disabled);
  limpiar.eventos.click();
  await registrar();
  assert.ok(limpiar.disabled && vehiculo.disabled && comprador.disabled);
  assert.equal(lecturasEstado.length, 0);
  assert.deepEqual([vehiculo.value, comprador.value], ['44', '2']);
  await registrar();
  assert.deepEqual(envios.slice(0, 3), Array(3).fill(envios[0]));
  assert.deepEqual(JSON.parse(envios[0].cuerpo), { vehiculoId: 44, compradorId: 2 });
  assert.deepEqual([vehiculo.value, comprador.value], ['', '']);
  assert.match(buscar('mensaje-venta').textContent, /Venta 19 completada/);
  assert.match(buscar('mensaje-estado-venta').textContent, /Venta 19 · Completada/);
  const fecha = buscar('detalle-estado-venta').hijos[0].hijos.at(-1).hijos.map((nodo) => nodo.textContent);
  assert.equal(fecha[0], 'Fecha de registro en Guayaquil');
  assert.match(fecha[1], /19.*2026.*(?:21:00|9:00\s*p\.)/);
  assert.equal(fecha[2], '2026-11-20T02:00:00Z');
  assert.equal(lecturasEstado.length, 1);
  assert.equal(buscar('acciones-venta-reciente').hidden, false);

  seleccionar('45', '1');
  await registrar();
  assert.notEqual(envios[3].clave, envios[0].clave);
  assert.equal(generarClave.mock.callCount(), 2);
  assert.equal(lecturasEstado.length, 2);
  modoListas = 'cerrando';
  const actualizacion = actualizar();
  buscar('cerrar-sesion').eventos.click();
  terminarActualizacion();
  await actualizacion;
  assert.equal(buscar('panel-estado-venta').hidden, true);
  assert.equal(buscar('panel-catalogo').hidden, true);
  assert.deepEqual([vehiculo.options.length, comprador.options.length], [1, 1]);
});
