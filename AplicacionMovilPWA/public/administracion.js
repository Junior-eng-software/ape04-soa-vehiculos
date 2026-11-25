import { solicitarApi } from './api.js?v=6';

export function crearAdministracion(sesionVencida) {
  const buscar = (id) => document.querySelector('#' + id);
  const panel = buscar('panel-administracion');
  const selectorRol = buscar('rol-usuario-nuevo');
  const selectorUsuario = buscar('usuario-restablecer');
  const actualizar = buscar('actualizar-administracion');
  const mensaje = buscar('mensaje-administracion');
  const botonUsuario = buscar('crear-usuario');
  const botonClave = buscar('restablecer-clave');
  const botonRol = buscar('crear-rol');
  const formularios = ['formulario-usuario', 'formulario-clave', 'formulario-rol'].map(buscar);
  let sesion;

  function mostrar(texto, tipo = 'neutro') {
    mensaje.textContent = texto;
    mensaje.className = 'mensaje ' + tipo;
    mensaje.hidden = !texto;
  }

  function acciones(ocupado) {
    actualizar.disabled = botonRol.disabled = ocupado;
    botonUsuario.disabled = ocupado || selectorRol.options.length < 2;
    botonClave.disabled = ocupado || selectorUsuario.options.length < 2;
  }

  async function ejecutar(operacion) {
    const actual = sesion;
    if (!actual || actualizar.disabled) return;
    acciones(true);
    mostrar('Procesando solicitud…');
    try {
      const resultado = await operacion(actual);
      if (sesion === actual) mostrar(resultado, 'exito');
    } catch (error) {
      if (sesion !== actual) return;
      if (error.codigoHttp === 401) return sesionVencida();
      const mensajes = {
        400: 'Revise los datos ingresados.',
        403: 'No tiene permiso para realizar esta operación.',
        404: 'El usuario ya no está disponible. Actualice las listas.',
        409: 'El usuario o rol ya existe.',
        422: 'Revise los datos ingresados.',
      };
      mostrar(error.codigoHttp
        ? `HTTP ${error.codigoHttp}: ${mensajes[error.codigoHttp] || 'La solicitud no se pudo completar.'}`
        : 'No se pudo conectar con Administración.', 'error');
    } finally {
      if (sesion === actual) acciones(false);
    }
  }

  function opcionUsuario(usuario) {
    return new Option(`${usuario.username} · ${usuario.rol}`, String(usuario.id));
  }

  function cargarListas() {
    return ejecutar(async ({ jwt, signal, usuario }) => {
      const [roles, usuarios] = await Promise.all([
        solicitarApi('/api/roles', jwt, signal), solicitarApi('/api/usuarios', jwt, signal),
      ]);
      if (signal.aborted) return;
      selectorRol.replaceChildren(new Option('Seleccione un rol', ''),
        ...roles.map(({ nombre }) => new Option(nombre, nombre)));
      selectorUsuario.replaceChildren(new Option('Seleccione un usuario', ''),
        ...usuarios.filter(({ username }) => username.toLowerCase() !== usuario.toLowerCase()).map(opcionUsuario));
      return '';
    });
  }

  actualizar.addEventListener('click', cargarListas);
  formularios[0].addEventListener('submit', (evento) => {
    evento.preventDefault();
    return ejecutar(async ({ jwt, signal }) => {
      const campoClave = buscar('clave-usuario-nuevo');
      const datos = { username: buscar('usuario-nuevo').value, clave: campoClave.value, rol: selectorRol.value };
      const solicitud = solicitarApi('/api/usuarios', jwt, signal, 'POST', datos);
      campoClave.value = '';
      const usuario = await solicitud;
      if (signal.aborted) return;
      formularios[0].reset();
      selectorUsuario.add(opcionUsuario(usuario));
      return `Usuario ${usuario.username} creado.`;
    });
  });

  formularios[1].addEventListener('submit', (evento) => {
    evento.preventDefault();
    return ejecutar(async ({ jwt, signal }) => {
      const campoClave = buscar('clave-restablecer');
      const solicitud = solicitarApi('/api/usuarios/' + selectorUsuario.value + '/clave',
        jwt, signal, 'PUT', { clave: campoClave.value });
      campoClave.value = '';
      await solicitud;
      if (signal.aborted) return;
      formularios[1].reset();
      return 'Clave restablecida.';
    });
  });

  formularios[2].addEventListener('submit', (evento) => {
    evento.preventDefault();
    return ejecutar(async ({ jwt, signal }) => {
      const rol = await solicitarApi('/api/roles', jwt, signal, 'POST', {
        nombre: buscar('nombre-rol').value,
        rolBase: buscar('base-rol').value,
        descripcion: buscar('descripcion-rol').value,
      });
      if (signal.aborted) return;
      formularios[2].reset();
      selectorRol.add(new Option(rol.nombre, rol.nombre));
      return `Rol ${rol.nombre} creado.`;
    });
  });

  return {
    abrir(jwt, usuario) {
      const controlador = new AbortController();
      sesion = { jwt, usuario, controlador, signal: controlador.signal };
      panel.hidden = false;
      acciones(false);
      return cargarListas();
    },
    cerrar() {
      sesion?.controlador.abort();
      sesion = undefined;
      panel.hidden = true;
      for (const formulario of formularios) formulario.reset();
      selectorRol.replaceChildren(new Option('Seleccione un rol', ''));
      selectorUsuario.replaceChildren(new Option('Seleccione un usuario', ''));
      mostrar('');
    },
  };
}
