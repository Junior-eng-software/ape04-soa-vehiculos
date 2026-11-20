/**
 * Servidor de desarrollo local sin dependencias externas.
 * Sirve la PWA y reenvía autenticación y catálogo a través de NGINX.
 * La URL pública siempre es del mismo origen para evitar problemas CORS.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const GATEWAY_LOCAL = 'http://127.0.0.1:8090';
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};

function responderJson(respuesta, estado, datos) {
  respuesta.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8' });
  respuesta.end(JSON.stringify(datos));
}

function origenLoginPermitido(peticion) {
  try {
    const destino = new URL('http://' + peticion.headers.host);
    return ['localhost', '127.0.0.1', '[::1]'].includes(destino.hostname)
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peticion.socket.remoteAddress)
      && (!peticion.headers.origin || peticion.headers.origin === destino.origin);
  } catch {
    return false;
  }
}

async function autenticar(peticion, respuesta, urlToken, clientePwa) {
  if (peticion.method !== 'POST') {
    respuesta.setHeader('Allow', 'POST');
    return responderJson(respuesta, 405, { error: 'Método no permitido.' });
  }
  if (!origenLoginPermitido(peticion)) {
    return responderJson(respuesta, 403, { error: 'Origen no autorizado.' });
  }
  if (peticion.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return responderJson(respuesta, 415, { error: 'Se requiere un cuerpo JSON.' });
  }
  if (!clientePwa.id?.trim() || !clientePwa.secreto?.trim()) {
    return responderJson(respuesta, 503, { error: 'El inicio de sesión no está configurado.' });
  }

  let datos;
  try {
    const trozos = [];
    let tamano = 0;
    for await (const trozo of peticion.iterator({ destroyOnReturn: false })) {
      tamano += trozo.length;
      if (tamano > 8192) {
        peticion.resume();
        return responderJson(respuesta, 413, { error: 'Solicitud demasiado grande.' });
      }
      trozos.push(trozo);
    }
    datos = JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    return responderJson(respuesta, 400, { error: 'Solicitud de acceso inválida.' });
  }
  if (!datos || typeof datos.username !== 'string' || !datos.username.trim()
      || typeof datos.password !== 'string' || !datos.password
      || Object.keys(datos).length !== 2) {
    return responderJson(respuesta, 400, { error: 'Se requieren usuario y contraseña.' });
  }

  const signal = AbortSignal.timeout(12000);
  try {
    const basic = Buffer.from(clientePwa.id + ':' + clientePwa.secreto, 'utf8').toString('base64');
    const remoto = await fetch(urlToken, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + basic, Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'password',
        username: datos.username.trim(),
        password: datos.password,
      }),
      signal,
      redirect: 'error',
      cache: 'no-store',
    });

    if (remoto.status === 401 || remoto.status === 403) {
      return responderJson(respuesta, remoto.status, { error: 'Acceso rechazado.' });
    }
    if (remoto.status !== 200) {
      return responderJson(respuesta, 502, { error: 'Respuesta inesperada del servicio de acceso.' });
    }
    const acceso = await remoto.json();
    if (typeof acceso?.access_token !== 'string'
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(acceso.access_token)
        || typeof acceso.token_type !== 'string' || acceso.token_type.toLowerCase() !== 'bearer'
        || !Number.isInteger(acceso.expires_in) || acceso.expires_in <= 0
        || acceso.expires_in > 2147483) {
      return responderJson(respuesta, 502, { error: 'Respuesta de acceso inválida.' });
    }
    return responderJson(respuesta, 200, {
      access_token: acceso.access_token,
      expires_in: acceso.expires_in,
    });
  } catch {
    return responderJson(respuesta, signal.aborted ? 504 : 502, { error: 'Servicio de acceso no disponible.' });
  }
}

export function crearServidor({
  directorio = resolve(ROOT, 'public'),
  apiBase = process.env.API_BASE_URL || GATEWAY_LOCAL,
  clientePwa = {
    id: process.env.VEHICULOS_PWA_CLIENT_ID,
    secreto: process.env.VEHICULOS_PWA_CLIENT_SECRET,
  },
} = {}) {
  const carpeta = resolve(directorio);
  const destino = apiBase.replace(/\/$/, '');

  return createServer(async (peticion, respuesta) => {
    const url = new URL(peticion.url || '/', 'http://localhost');
    respuesta.setHeader('X-Content-Type-Options', 'nosniff');
    respuesta.setHeader('Referrer-Policy', 'no-referrer');
    respuesta.setHeader('Cache-Control', 'no-store');

    if (url.pathname === '/api/login') {
      return autenticar(peticion, respuesta, destino + '/oauth/token', clientePwa);
    }

    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/vehiculos' || peticion.method !== 'GET') {
        respuesta.writeHead(404, { 'Content-Type': 'application/json' });
        respuesta.end(JSON.stringify({ error: 'Endpoint no disponible' }));
        return;
      }
      const abortador = new AbortController();
      const temporizador = setTimeout(() => abortador.abort(), 12000);
      try {
        const encabezados = { Accept: 'application/json' };
        if (peticion.headers.authorization) {
          encabezados.Authorization = peticion.headers.authorization;
        }
        const remoto = await fetch(destino + '/api/vehiculos', {
          method: 'GET', headers: encabezados, signal: abortador.signal, cache: 'no-store',
        });
        const datos = Buffer.from(await remoto.arrayBuffer());
        respuesta.writeHead(remoto.status, {
          'Content-Type': remoto.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store', 'Vary': 'Authorization',
        });
        respuesta.end(datos);
      } catch (error) {
        const tiempoAgotado = error.name === 'AbortError';
        respuesta.writeHead(tiempoAgotado ? 504 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        respuesta.end(JSON.stringify({ error: tiempoAgotado ? 'Tiempo de espera agotado' : 'API Java no disponible' }));
      } finally {
        clearTimeout(temporizador);
      }
      return;
    }

    if (peticion.method !== 'GET' && peticion.method !== 'HEAD') {
      respuesta.writeHead(405); respuesta.end(); return;
    }

    let ruta;
    try { ruta = decodeURIComponent(url.pathname); }
    catch { respuesta.writeHead(400); respuesta.end(); return; }
    if (ruta.split(/[\\/]/).some((segmento) => segmento.startsWith('.'))) {
      respuesta.writeHead(404); respuesta.end(); return;
    }
    const archivo = resolve(carpeta, '.' + (ruta === '/' ? '/index.html' : ruta));
    if (!(archivo === carpeta || archivo.startsWith(carpeta + sep))) {
      respuesta.writeHead(403); respuesta.end(); return;
    }
    try {
      const detalle = await stat(archivo);
      if (!detalle.isFile()) throw new Error('Archivo no encontrado');
      respuesta.setHeader('Content-Type', TIPOS[extname(archivo)] || 'application/octet-stream');
      if (peticion.method === 'HEAD') { respuesta.writeHead(200); respuesta.end(); return; }
      respuesta.writeHead(200);
      respuesta.end(await readFile(archivo));
    } catch {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('Recurso no encontrado');
    }
  });
}

// Se habilita uso como módulo para pruebas, sin iniciar puerto al importarlo.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile?.(resolve(ROOT, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('No se pudo cargar la configuración privada de la PWA.');
      process.exit(1);
    }
  }
  const argPuerto = process.argv.find((arg) => arg.startsWith('--port='));
  const argCarpeta = process.argv.find((arg) => arg.startsWith('--dir='));
  const puerto = Number(argPuerto?.split('=')[1] || process.env.PORT || 5173);
  const host = process.env.HOST || '127.0.0.1';
  const carpeta = resolve(ROOT, argCarpeta?.split('=')[1] || 'public');
  crearServidor({ directorio: carpeta }).listen(puerto, host, () => {
    console.log(`PWA disponible: http://localhost:${puerto}`);
    console.log('Rutas locales: /api/login y /api/vehiculos.');
    console.log('Para cerrar: Ctrl + C');
  });
}
