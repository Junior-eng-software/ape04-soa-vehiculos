export const consultaInicial = { estado: 'inicial' };

export function crearConsulta(cargar, publicar) {
  let activa = null;

  function cancelar() {
    activa?.abort();
    activa = null;
  }

  return {
    cancelar,
    reiniciar() {
      cancelar();
      publicar(consultaInicial);
    },
    async ejecutar(token, alVencer, signalSesion) {
      if (activa || signalSesion?.aborted) return;
      const actual = new AbortController();
      const signal = signalSesion ? AbortSignal.any([actual.signal, signalSesion]) : actual.signal;
      activa = actual;
      publicar({ estado: 'cargando' });
      try {
        const datos = await cargar(token, signal);
        if (!signal.aborted) publicar({ estado: 'listo', datos });
      } catch (error) {
        if (!signal.aborted) {
          if (error.status === 401 && alVencer) alVencer();
          else publicar({ estado: 'error', mensaje: error.message });
        }
      } finally {
        if (activa === actual) activa = null;
      }
    },
  };
}

export function cargarConsultaDeSesion(consulta, sesion, id) {
  const credenciales = sesion.obtenerSesion(id);
  if (credenciales) {
    return consulta.ejecutar(credenciales.token, () => sesion.expirar(id), credenciales.signal);
  }
}
