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
    async ejecutar(token) {
      if (activa) return;
      const actual = new AbortController();
      activa = actual;
      publicar({ estado: 'cargando' });
      try {
        const datos = await cargar(token, actual.signal);
        if (!actual.signal.aborted) publicar({ estado: 'listo', datos });
      } catch (error) {
        if (!actual.signal.aborted) {
          publicar({ estado: 'error', mensaje: error.message });
        }
      } finally {
        if (activa === actual) activa = null;
      }
    },
  };
}
