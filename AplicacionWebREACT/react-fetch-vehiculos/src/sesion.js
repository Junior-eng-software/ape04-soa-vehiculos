export const sesionInicial = { estado: 'sinSesion', mensaje: '' };
export const mensajeVencida = 'Tu sesión venció. Inicia sesión de nuevo';

const mensajes = {
  campos: 'Completa el usuario y la contraseña.',
  credenciales: 'Usuario o contraseña incorrectos.',
  configuracion: 'Error de configuración de la aplicación.',
  acceso_denegado: 'Acceso denegado.',
  no_autorizado: 'No se pudo iniciar sesión.',
  servicio: 'Servicio no disponible.',
};

async function solicitar(ruta, opciones, ejecutarFetch) {
  try {
    return await ejecutarFetch(ruta, { ...opciones, cache: 'no-store', redirect: 'error' });
  } catch {
    throw new Error(mensajes.servicio);
  }
}

export async function iniciarSesion(usuario, clave, signal, ahora, ejecutarFetch = fetch) {
  if (!usuario.trim() || !clave.trim()) throw new Error(mensajes.campos);

  const login = await solicitar('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usuario.trim(), password: clave }), signal,
  }, ejecutarFetch);
  const datos = await login.json().catch(() => null);
  if (!login.ok) {
    if (login.status === 403) throw new Error(mensajes.acceso_denegado);
    if (login.status === 401) {
      const codigo = ['credenciales', 'configuracion'].includes(datos?.codigo)
        ? datos.codigo : 'no_autorizado';
      throw new Error(mensajes[codigo]);
    }
    if (login.status === 503 && datos?.codigo === 'configuracion') {
      throw new Error(mensajes.configuracion);
    }
    throw new Error(mensajes.servicio);
  }

  const token = datos?.access_token;
  const duracion = datos?.expires_in;
  if (typeof token !== 'string' || !token || !Number.isFinite(duracion) || duracion <= 0) {
    throw new Error(mensajes.servicio);
  }
  const vence = ahora() + duracion * 1000;
  const respuesta = await solicitar('/api/identidad', {
    headers: { Authorization: 'Bearer ' + token }, signal,
  }, ejecutarFetch);
  if (respuesta.status === 401) throw new Error(mensajeVencida);
  if (respuesta.status === 403) throw new Error(mensajes.acceso_denegado);
  if (!respuesta.ok) throw new Error(mensajes.servicio);

  const identidad = await respuesta.json().catch(() => null);
  const rolBase = identidad?.roles?.[0];
  const rol = identidad?.rolNombre || (typeof rolBase === 'string' ? rolBase.replace(/^ROLE_/, '') : '');
  if (typeof identidad?.usuario !== 'string' || !identidad.usuario || typeof rol !== 'string' || !rol) {
    throw new Error(mensajes.servicio);
  }
  return { token, vence, identidad: { usuario: identidad.usuario, rol } };
}

export async function enviarIngreso(evento, sesion) {
  evento.preventDefault();
  const { usuario, clave } = evento.currentTarget.elements;
  const ingreso = sesion.entrar(usuario.value, clave.value);
  clave.value = '';
  if (await ingreso === false) clave.focus();
}

export function crearSesion({
  publicar, autenticar = iniciarSesion, ahora = Date.now,
  programar = setTimeout, cancelar = clearTimeout,
}) {
  let sesion = null;
  let solicitud = null;
  let temporizador;
  let siguienteId = 0;

  function limpiar() {
    solicitud?.abort();
    solicitud = null;
    sesion?.controlador.abort();
    sesion = null;
    cancelar(temporizador);
    temporizador = undefined;
  }

  function cerrar(mensaje = '') {
    limpiar();
    publicar({ ...sesionInicial, mensaje });
  }

  function expirar(id) {
    if (sesion && sesion.id === id) cerrar(mensajeVencida);
  }

  return {
    async entrar(usuario, clave) {
      if (solicitud || sesion) return;
      const actual = new AbortController();
      solicitud = actual;
      publicar({ ...sesionInicial, estado: 'verificando' });
      try {
        const nueva = await autenticar(usuario, clave, actual.signal, ahora);
        if (actual.signal.aborted) return;
        const restante = nueva.vence - ahora();
        if (restante <= 0) {
          cerrar(mensajeVencida);
          return false;
        }
        const id = ++siguienteId;
        sesion = { ...nueva, id, controlador: actual };
        temporizador = programar(() => expirar(id), restante);
        publicar({ estado: 'activa', id, identidad: nueva.identidad, mensaje: '' });
        return true;
      } catch (error) {
        if (actual.signal.aborted) return;
        publicar({ ...sesionInicial, mensaje: error.message });
        return false;
      } finally {
        if (solicitud === actual) solicitud = null;
      }
    },
    obtenerSesion(id) {
      if (!sesion || sesion.id !== id) return null;
      if (ahora() >= sesion.vence) {
        expirar(id);
        return null;
      }
      return { token: sesion.token, signal: sesion.controlador.signal };
    },
    expirar,
    cerrar,
    limpiar,
  };
}
