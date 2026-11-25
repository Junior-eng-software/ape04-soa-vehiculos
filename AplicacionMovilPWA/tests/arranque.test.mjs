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
      open: async (nombre) => { assert.equal(nombre, 'vehiculos-pwa-v10'); return cache; },
      keys: async () => ['vehiculos-pwa-v9', 'vehiculos-pwa-v10', 'otra-app'],
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
  assert.deepEqual(eliminados, ['vehiculos-pwa-v9']);

  for (const [ruta, opciones] of [
    ['/api/login', { method: 'POST' }], ['/api/ventas/19'], ['/ventas.js?v=4'],
    ['/api/identidad'], ['/api/usuarios'], ['/api/roles'], ['/api/usuarios/1/clave', { method: 'PUT' }],
    ['/api/ventas?incluirAnuladas=true'], ['/api/ventas/19', { method: 'DELETE' }],
    ['/ventas.js?v=6', { headers: { Authorization: 'Bearer simulado' } }],
  ]) {
    eventos.fetch({ request: new Request(origen + ruta, opciones), respondWith: () => assert.fail(ruta) });
  }
  const solicitud = new Request(origen + '/ventas.js?v=6');
  eventos.fetch({ request: solicitud, respondWith: (promesa) => { tarea = promesa; } });
  assert.equal(await tarea, solicitud);
});

test('controlador conserva la sesión, separa compradores homónimos y bloquea la limpieza de ventas inciertas', async (t) => {
  const html = await recurso('index.html');
  const controles = new Map(Array.from(html.matchAll(/\bid="([\w-]+)"/g), ([, id]) => [id, {
    value: '', eventos: {}, options: [], hijos: [], reset() {}, focus() {},
    append(...hijos) { this.hijos.push(...hijos); },
    add(opcion) { this.options.push(opcion); },
    replaceChildren(...opciones) { this.options = opciones; this.hijos = []; this.value = ''; },
    get selectedOptions() { return this.options.filter((opcion) => opcion.value === this.value); },
    addEventListener(nombre, listener) { this.eventos[nombre] = listener; },
  }]));
  const buscar = (id) => controles.get(id);
  let confirmarAnulacion = false;
  const globales = { document: { querySelector: (selector) => buscar(selector.slice(1)), createElement: () => ({
    hijos: [], eventos: {}, append(...hijos) { this.hijos.push(...hijos); },
    addEventListener(nombre, listener) { this.eventos[nombre] = listener; },
  }) },
    window: { addEventListener() {}, confirm: () => confirmarAnulacion }, Option: class {
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
  await import('../public/main.js?v=10');
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

  const identidad = (base, rolNombre = base) => Response.json({
    usuario: 'persona', roles: ['ROLE_' + base], rolNombre,
  });
  fetchSimulado.mock.mockImplementation((ruta) => ruta === '/api/identidad' ? identidad('OPERADOR')
    : Response.json({ access_token: 'token.simulado.firma', expires_in: 5 }));
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
  let rolActivo = 'OPERADOR';
  const solicitudesAdmin = [];
  const ventas = new Map();
  const solicitudesAnular = [];
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
    if (ruta === '/api/identidad') return identidad(rolActivo, rolActivo === 'OPERADOR' ? 'VENDEDOR' : rolActivo);
    if (modoListas === 'cerrando') await esperaCierre;
    if (ruta === '/api/vehiculos') {
      assert.equal(opciones.headers.get('Authorization'), 'Bearer token.simulado.firma');
      if (modoListas === 'parcial') await esperaVehiculos;
      return Response.json(catalogoRespuesta);
    }
    assert.equal(opciones.headers.Authorization, 'Bearer token.simulado.firma');
    if (ruta === '/api/roles' || ruta.startsWith('/api/usuarios')) {
      solicitudesAdmin.push([ruta, opciones.method]);
      if (opciones.method === 'GET') return Response.json(ruta === '/api/roles'
        ? [{ nombre: 'CONSULTA' }, { nombre: 'OPERADOR' }]
        : [{ id: 1, username: 'persona', rol: 'ADMIN' }]);
      const datos = JSON.parse(opciones.body);
      if (ruta === '/api/roles') return Response.json({ nombre: datos.nombre }, { status: 201 });
      if (opciones.method === 'POST') {
        assert.equal(datos.rol, 'VENDEDOR');
        return Response.json({ id: 2, username: datos.username, rol: datos.rol }, { status: 201 });
      }
      assert.equal(ruta, '/api/usuarios/2/clave');
      return new Response(null, { status: 204 });
    }
    if (ruta === '/api/compradores') {
      if (modoListas === 'parcial') {
        await esperaCompradores;
        return new Response(null, { status: 503 });
      }
      return Response.json(modoListas === 'vacío' ? [] : [1, 2].map((id) => ({ id, nombre: 'Nombre igual' })));
    }
    if (ruta.startsWith('/api/ventas/')) {
      const venta = ventas.get(Number(ruta.split('/').at(-1)));
      if (opciones.method === 'DELETE') {
        assert.equal(rolActivo, 'ADMIN');
        solicitudesAnular.push(venta.id);
        if (solicitudesAnular.length === 1) return new Response(null, { status: 409 });
        if (solicitudesAnular.length === 2) {
          venta.estado = 'ANULANDO';
          return new Response(null, { status: 202 });
        }
        venta.estado = 'ANULADA';
        catalogoRespuesta.find((v) => v.idVehiculo === venta.vehiculoId).estado = 'DISPONIBLE';
        return new Response(null, { status: 204 });
      }
      lecturasEstado.push(ruta);
      return Response.json(venta);
    }
    if (ruta.startsWith('/api/ventas') && !opciones.method) {
      const incluir = ruta.endsWith('?incluirAnuladas=true');
      if (incluir) assert.equal(rolActivo, 'ADMIN');
      return Response.json([...ventas.values()].filter((venta) => incluir || venta.estado !== 'ANULADA'));
    }
    assert.equal(ruta, '/api/ventas');
    envios.push({ clave: opciones.headers['Idempotency-Key'], cuerpo: opciones.body });
    const numero = envios.length;
    if (numero === 2) return new Response(null, { status: 504 });
    const venta = { id: numero <= 3 ? 19 : numero + 16, ...JSON.parse(opciones.body),
      estado: numero === 1 ? 'EN_REVISION' : 'COMPLETADA', precioAcordado: null, moneda: null,
      fechaUTC: '2026-11-20T02:00:00Z' };
    ventas.set(venta.id, venta);
    if (venta.estado === 'COMPLETADA') {
      catalogoRespuesta.find((v) => v.idVehiculo === venta.vehiculoId).estado = 'VENDIDO';
    }
    return Response.json(venta, { status: numero === 1 ? 202 : numero === 3 ? 200 : 201 });
  });
  const vehiculo = buscar('vehiculo-venta');
  const comprador = buscar('comprador-venta');
  const limpiar = buscar('limpiar-seleccion');
  const acceso = enviar();
  await new Promise((resolver) => setImmediate(resolver));
  assert.deepEqual(rutas, ['/api/login', '/api/identidad', '/api/vehiculos', '/api/compradores', '/api/ventas']);
  assert.deepEqual([vehiculo.options[0].text, comprador.options[0].text], ['Cargando...', 'Cargando...']);
  resolverCompradores();
  await new Promise((resolver) => setImmediate(resolver));
  assert.match(buscar('estado-lista-compradores').textContent, /Actualizar listas/);
  assert.equal(vehiculo.options[0].text, 'Cargando...');
  resolverVehiculos();
  await acceso;
  assert.equal(buscar('perfil-sesion').textContent, 'persona · VENDEDOR');
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

  modoListas = 'normal';
  rolActivo = 'CONSULTA';
  const inicioConsulta = rutas.length;
  await enviar();
  assert.equal(buscar('panel-administracion').hidden, true);
  assert.deepEqual(rutas.slice(inicioConsulta), ['/api/login', '/api/identidad', '/api/vehiculos', '/api/ventas']);
  assert.equal(buscar('filtro-ventas-anuladas').hidden, true);
  assert.ok(buscar('listado-ventas').hijos.every((fila) => fila.hijos.length === 1));
  assert.ok(vehiculo.disabled && comprador.disabled && buscar('registrar-venta').disabled);
  assert.match(buscar('mensaje-venta').textContent, /CONSULTA no puede registrar ventas/);
  seleccionar('44', '1');
  await registrar();
  assert.equal(envios.length, 4);
  buscar('cerrar-sesion').eventos.click();

  rolActivo = 'ADMIN';
  await enviar();
  assert.equal(buscar('panel-administracion').hidden, false);
  const enviarAdmin = (id) => buscar(id).eventos.submit({ preventDefault() {} });
  buscar('nombre-rol').value = 'VENDEDOR';
  buscar('base-rol').value = 'OPERADOR';
  await enviarAdmin('formulario-rol');
  assert.ok(buscar('rol-usuario-nuevo').options.some(({ value }) => value === 'VENDEDOR'));
  buscar('usuario-nuevo').value = 'vendedor_demo';
  buscar('rol-usuario-nuevo').value = 'VENDEDOR';
  buscar('clave-usuario-nuevo').value = crypto.randomUUID();
  await enviarAdmin('formulario-usuario');
  assert.equal(buscar('clave-usuario-nuevo').value, '');
  assert.deepEqual(buscar('usuario-restablecer').options.map(({ value }) => value), ['', '2']);
  buscar('usuario-restablecer').value = '2';
  buscar('clave-restablecer').value = crypto.randomUUID();
  await enviarAdmin('formulario-clave');
  assert.equal(buscar('clave-restablecer').value, '');
  assert.match(buscar('mensaje-administracion').textContent, /Clave restablecida/);
  assert.deepEqual(solicitudesAdmin, [
    ['/api/roles', 'GET'], ['/api/usuarios', 'GET'], ['/api/roles', 'POST'],
    ['/api/usuarios', 'POST'], ['/api/usuarios/2/clave', 'PUT'],
  ]);

  const filaVenta19 = () => buscar('listado-ventas').hijos.find((fila) => fila.hijos[0].textContent.includes('Venta 19'));
  const eliminar = () => filaVenta19().hijos[1].eventos.click();
  assert.equal(buscar('filtro-ventas-anuladas').hidden, false);
  assert.equal(filaVenta19().hijos[1].textContent, 'Eliminar');
  assert.ok(!vehiculo.options.some(({ value }) => value === '44'));
  await eliminar();
  assert.deepEqual(solicitudesAnular, []);
  confirmarAnulacion = true;
  await eliminar();
  assert.match(buscar('mensaje-listado-ventas').textContent, /no se puede eliminar/);
  await eliminar();
  assert.match(buscar('mensaje-listado-ventas').textContent, /pendiente/);
  assert.equal(filaVenta19().hijos[1].textContent, 'Reintentar anulación');
  await eliminar();
  assert.deepEqual(solicitudesAnular, [19, 19, 19]);
  assert.equal(buscar('mensaje-listado-ventas').textContent, 'Venta 19 anulada.');
  assert.equal(filaVenta19(), undefined);
  assert.ok(vehiculo.options.some(({ value }) => value === '44'));
  buscar('incluir-ventas-anuladas').checked = true;
  await buscar('incluir-ventas-anuladas').eventos.change();
  assert.match(filaVenta19().hijos[0].textContent, /Anulada/);
  assert.equal(filaVenta19().hijos.length, 1);
  seleccionar('44', '1');
  await registrar();
  assert.notEqual(envios.at(-1).clave, envios[0].clave);
  assert.ok(!vehiculo.options.some(({ value }) => value === '44'));
  buscar('cerrar-sesion').eventos.click();
  assert.equal(buscar('panel-administracion').hidden, true);
});
