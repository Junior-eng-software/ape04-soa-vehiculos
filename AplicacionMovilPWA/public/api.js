/**
 * Cliente HTTP de vehículos. No conoce la interfaz ni accede a MySQL.
 * La ruta relativa /api/vehiculos es reenviada por server.mjs a Spring Boot.
 */
export function normalizarToken(entrada = '') {
  // Se aceptan tanto JWT sin prefijo como textos que empiezan con Bearer.
  return String(entrada).trim().replace(/^Bearer\s+/i, '').trim();
}

export class ErrorAcceso extends Error {}

export async function iniciarSesion(username, password, ejecutarFetch = fetch, signal) {
  const solicitud = new AbortController();
  const cancelar = () => solicitud.abort();
  const limite = setTimeout(cancelar, 15000);
  if (signal?.aborted) cancelar();
  signal?.addEventListener('abort', cancelar, { once: true });
  try {
    const respuesta = await ejecutarFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
      redirect: 'error',
      signal: solicitud.signal,
    });
    if (respuesta.status !== 200) {
      const mensajes = {
        400: 'Revise el usuario y la contraseña introducidos.',
        401: 'Usuario o contraseña no válidos.',
        403: 'Acceso no permitido.',
        504: 'El servicio de acceso no respondió a tiempo.',
      };
      const mensaje = mensajes[respuesta.status] || (respuesta.status >= 500
        ? 'El servicio de acceso no está disponible.' : 'No se pudo completar el acceso.');
      throw new ErrorAcceso(`HTTP ${respuesta.status}: ${mensaje}`);
    }
    const datos = await respuesta.json();
    if (typeof datos?.access_token !== 'string'
        || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(datos.access_token)
        || !Number.isInteger(datos.expires_in) || datos.expires_in <= 0
        || datos.expires_in > 2147483) {
      throw new ErrorAcceso('El servidor devolvió una respuesta de acceso inválida.');
    }
    return { jwt: datos.access_token, segundos: datos.expires_in };
  } catch (error) {
    if (error instanceof ErrorAcceso) throw error;
    if (solicitud.signal.aborted) throw new ErrorAcceso('El servicio de acceso no respondió a tiempo.');
    if (error instanceof SyntaxError) throw new ErrorAcceso('El servidor devolvió una respuesta de acceso inválida.');
    throw new ErrorAcceso('No se pudo conectar con el servicio de acceso.');
  } finally {
    clearTimeout(limite);
    signal?.removeEventListener('abort', cancelar);
  }
}

export async function listarVehiculos(entradaToken, ejecutarFetch = fetch, signal) {
  const jwt = normalizarToken(entradaToken);
  const encabezados = new Headers({ Accept: 'application/json' });

  // Si no hay JWT, el backend es quien determina si responde HTTP 401.
  if (jwt) encabezados.set('Authorization', `Bearer ${jwt}`);

  let respuesta;
  try {
    // No se almacena en caché la respuesta con datos protegidos.
    respuesta = await ejecutarFetch('/api/vehiculos', {
      method: 'GET',
      headers: encabezados,
      cache: 'no-store',
      signal,
    });
  } catch {
    throw new Error('No se pudo conectar con el servicio. Compruebe la red y Spring Boot.');
  }

  if (!respuesta.ok) {
    const mensajes = {
      401: 'HTTP 401: JWT ausente, inválido o vencido.',
      403: 'HTTP 403: el usuario no tiene permiso para consultar.',
      404: 'HTTP 404: no se encontró /api/vehiculos.',
      502: 'HTTP 502: no se pudo establecer conexión con Spring Boot.',
      503: 'HTTP 503: el servicio no está disponible.',
      504: 'HTTP 504: Spring Boot no respondió a tiempo.',
    };
    const error = new Error(mensajes[respuesta.status] || `HTTP ${respuesta.status}: consulta no completada.`);
    error.codigoHttp = respuesta.status;
    throw error;
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error('La API devolvió una respuesta que no es JSON válido.');
  }
  if (!Array.isArray(datos)) {
    throw new Error('La API debe devolver un arreglo JSON de vehículos.');
  }
  return { codigoHttp: respuesta.status, vehiculos: datos };
}
