const rutaLogin = '/auth/login';
const limiteBytes = 8192;

function responder(respuesta, status, datos) {
  respuesta.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  respuesta.end(JSON.stringify(datos));
}

function codigoNoAutorizado(datos) {
  const codigo = datos?.codigo ?? datos?.error;
  const mensaje = typeof datos?.mensaje === 'string'
    ? datos.mensaje.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
    : '';
  if (datos?.success !== true) {
    if (codigo === 'invalid_client' || /^cliente\s+no\s+autorizado\b/.test(mensaje)) {
      return 'configuracion';
    }
    if (codigo === 'invalid_grant' || /^usuario\s+o\s+contrasena\s+incorrectos\b/.test(mensaje)) {
      return 'credenciales';
    }
  }
  return 'no_autorizado';
}

export function crearProxyLogin({ destino, clientId, clientSecret, ejecutarFetch = fetch }) {
  return async (peticion, respuesta, siguiente) => {
    if (peticion.url?.split('?')[0] !== rutaLogin) return siguiente();
    if (peticion.method !== 'POST') {
      respuesta.setHeader('Allow', 'POST');
      return responder(respuesta, 405, { codigo: 'metodo' });
    }
    const { origin, host } = peticion.headers;
    if (origin && origin !== 'http://' + host && origin !== 'https://' + host) {
      return responder(respuesta, 403, { codigo: 'acceso_denegado' });
    }
    if (peticion.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return responder(respuesta, 415, { codigo: 'contenido' });
    }
    if (!clientId?.trim() || !clientSecret?.trim()) {
      return responder(respuesta, 503, { codigo: 'configuracion' });
    }

    const trozos = [];
    let bytes = 0;
    let datos;
    try {
      for await (const trozo of peticion.iterator({ destroyOnReturn: false })) {
        bytes += trozo.length;
        if (bytes > limiteBytes) {
          peticion.resume();
          return responder(respuesta, 413, { codigo: 'contenido' });
        }
        trozos.push(trozo);
      }
      datos = JSON.parse(Buffer.concat(trozos).toString('utf8'));
    } catch {
      return responder(respuesta, 400, { codigo: 'campos' });
    }
    if (typeof datos?.username !== 'string' || !datos.username.trim()
        || typeof datos.password !== 'string' || !datos.password.trim()) {
      return responder(respuesta, 400, { codigo: 'campos' });
    }

    try {
      const remoto = await ejecutarFetch(new URL('/oauth/token', destino), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: datos.username.trim(),
          password: datos.password,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (remoto.status === 401) {
        const error = await remoto.json().catch(() => null);
        return responder(respuesta, 401, { codigo: codigoNoAutorizado(error) });
      }
      if (remoto.status === 403) {
        return responder(respuesta, 403, { codigo: 'acceso_denegado' });
      }
      if (remoto.ok) {
        const { access_token, expires_in, scope } = await remoto.json();
        if (scope !== 'vehiculos') {
          return responder(respuesta, 503, { codigo: 'configuracion' });
        }
        if (typeof access_token === 'string' && access_token && Number.isFinite(expires_in) && expires_in > 0) {
          return responder(respuesta, 200, { access_token, expires_in });
        }
      }
    } catch {
      // Las excepciones de transporte pueden contener detalles privados.
    }
    return responder(respuesta, 503, { codigo: 'servicio' });
  };
}