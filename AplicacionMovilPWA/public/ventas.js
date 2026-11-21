const mensajes = {
  400: 'La solicitud no es válida.',
  401: 'JWT ausente, inválido o vencido.',
  403: 'No tiene permiso para la operación o el comprador seleccionado.',
  404: 'No se encontró el vehículo o el comprador.',
  409: 'La venta fue rechazada por un conflicto. Revise la disponibilidad y la selección.',
  422: 'Los datos de la solicitud no cumplen el contrato.',
};

function errorHttp(status, mensaje = mensajes[status] || 'No se pudo confirmar la respuesta.') {
  return Object.assign(new Error('HTTP ' + status + ': ' + mensaje), {
    codigoHttp: status,
    incierto: !Object.hasOwn(mensajes, status),
  });
}

export async function listarCompradores(jwt, signal, ejecutarFetch = fetch) {
  const respuesta = await ejecutarFetch('/api/compradores', {
    headers: { Authorization: 'Bearer ' + jwt, Accept: 'application/json' },
    cache: 'no-store', signal,
  }).catch(() => { throw new Error('No se pudo consultar compradores por un fallo de conexión.'); });
  if (respuesta.status !== 200) throw errorHttp(respuesta.status);
  const compradores = await respuesta.json().catch(() => null);
  if (!Array.isArray(compradores) || !compradores.every((c) => Number.isSafeInteger(c?.id)
      && c.id > 0 && typeof c.nombre === 'string')) {
    throw new Error('La API no devolvió el listado esperado de compradores.');
  }
  return compradores;
}

export async function consultarVenta(jwt, id, signal, ejecutarFetch = fetch) {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    throw new Error('Ingrese un ID de venta entero y positivo.');
  }
  const limite = AbortSignal.timeout(15000);
  const cancelacion = signal ? AbortSignal.any([signal, limite]) : limite;
  let respuesta;
  let venta;
  try {
    respuesta = await ejecutarFetch('/api/ventas/' + id, {
      headers: { Authorization: 'Bearer ' + jwt, Accept: 'application/json' },
      cache: 'no-store', signal: cancelacion, redirect: 'error',
    });
    if (respuesta.status === 200) venta = await respuesta.json();
  } catch (error) {
    if (limite.aborted) throw new Error('Se agotó el tiempo de espera al consultar la venta.');
    if (error instanceof SyntaxError) throw new Error('La API no devolvió los datos esperados de la venta.');
    throw new Error('Servicio de ventas no disponible por un fallo de conexión.');
  }

  const codigo = respuesta.status;
  if (codigo === 403) throw errorHttp(codigo, 'No tiene permiso para consultar esta venta.');
  if (codigo === 404) throw errorHttp(codigo, 'Venta inexistente.');
  if (codigo === 408 || codigo === 504) throw errorHttp(codigo, 'Se agotó el tiempo de espera al consultar la venta.');
  if (codigo >= 500) throw errorHttp(codigo, 'Servicio de ventas no disponible.');
  if (codigo !== 200) throw errorHttp(codigo);

  if (venta?.id !== Number(id) || !['PENDIENTE', 'EN_REVISION', 'FALLIDA', 'COMPLETADA'].includes(venta.estado)
      || ![venta.vehiculoId, venta.compradorId].every((valor) => Number.isSafeInteger(valor) && valor > 0)
      || !(venta.precioAcordado === null || typeof venta.precioAcordado === 'string')
      || !(venta.moneda === null || typeof venta.moneda === 'string')
      || typeof venta.fechaUTC !== 'string' || !Number.isFinite(Date.parse(venta.fechaUTC))) {
    throw new Error('La API no devolvió los datos esperados de la venta.');
  }
  return venta;
}

export async function registrarVenta(jwt, datos, clave, signal, ejecutarFetch = fetch) {
  const limite = AbortSignal.timeout(40000);
  const cancelacion = signal ? AbortSignal.any([signal, limite]) : limite;
  let respuesta;
  try {
    respuesta = await ejecutarFetch('/api/ventas', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + jwt, Accept: 'application/json',
        'Content-Type': 'application/json', 'Idempotency-Key': clave,
      },
      body: JSON.stringify(datos),
      cache: 'no-store', signal: cancelacion, redirect: 'error',
    });
  } catch {
    const mensaje = limite.aborted ? 'Se agotó el tiempo de espera.' : 'Se interrumpió la comunicación.';
    throw Object.assign(new Error(mensaje), { incierto: true });
  }

  const codigoHttp = respuesta.status;
  if (![200, 201, 202].includes(codigoHttp)) {
    if (codigoHttp === 408 || codigoHttp === 504) {
      throw errorHttp(codigoHttp, 'Se agotó el tiempo de espera.');
    }
    if (codigoHttp === 409) {
      const problema = await respuesta.json().catch(() => null);
      if (problema?.codigo === 'CLAVE_REUTILIZADA') {
        throw errorHttp(codigoHttp, 'La clave de idempotencia ya corresponde a otra solicitud.');
      }
    }
    throw errorHttp(codigoHttp);
  }

  const venta = await respuesta.json().catch(() => null);
  const estadoValido = codigoHttp === 202
    ? ['PENDIENTE', 'EN_REVISION'].includes(venta?.estado)
    : venta?.estado === 'COMPLETADA';
  if (!estadoValido || !Number.isSafeInteger(venta.id) || venta.id <= 0
      || venta.vehiculoId !== datos.vehiculoId || venta.compradorId !== datos.compradorId
      || !(venta.precioAcordado === null || typeof venta.precioAcordado === 'string')
      || !(venta.moneda === null || typeof venta.moneda === 'string')) {
    throw errorHttp(codigoHttp, 'La respuesta de venta no cumple el contrato.');
  }
  return { codigoHttp, venta };
}

export function crearRegistroVenta(enviar = registrarVenta, nuevaClave = () => crypto.randomUUID()) {
  let intento = null;

  return {
    pendiente: () => intento !== null,
    limpiar() { intento = null; },
    async registrar(jwt, { vehiculoId, compradorId }, signal) {
      if (intento?.enCurso) return null;
      if (![vehiculoId, compradorId].every((id) => Number.isSafeInteger(id) && id > 0)) {
        throw new Error('Seleccione un vehículo disponible y un comprador.');
      }
      if (intento && (vehiculoId !== intento.datos.vehiculoId || compradorId !== intento.datos.compradorId)) {
        throw new Error('Reintente con el mismo vehículo y comprador.');
      }
      const reintento = intento !== null;
      const actual = intento ?? { datos: { vehiculoId, compradorId }, clave: nuevaClave() };
      intento = actual;
      actual.enCurso = true;
      try {
        const resultado = await enviar(jwt, actual.datos, actual.clave, signal);
        if (intento === actual && resultado.codigoHttp !== 202) intento = null;
        return resultado;
      } catch (error) {
        // Un 401 en un reintento no aclara si la solicitud anterior llegó a procesarse.
        if (intento === actual && !error.incierto && !(reintento && error.codigoHttp === 401)) intento = null;
        throw error;
      } finally {
        actual.enCurso = false;
      }
    },
  };
}
