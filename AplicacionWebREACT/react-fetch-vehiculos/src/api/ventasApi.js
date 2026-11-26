function esVenta(venta) {
  return venta !== null && typeof venta === 'object'
    && Number.isInteger(venta.id)
    && Number.isInteger(venta.vehiculoId)
    && Number.isInteger(venta.compradorId)
    && typeof venta.estado === 'string'
    && (venta.precioAcordado === null || typeof venta.precioAcordado === 'string')
    && (venta.moneda === null || typeof venta.moneda === 'string')
    && typeof venta.fechaUTC === 'string';
}

export async function listarVentas(token, signal) {
  const headers = new Headers({ Accept: 'application/json' });
  if (token.trim()) headers.set('Authorization', `Bearer ${token.trim()}`);

  let respuesta;
  try {
    respuesta = await fetch('/api/ventas', { method: 'GET', headers, signal, cache: 'no-store' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('No se pudo conectar con la API de ventas.');
  }

  if (respuesta.status !== 200) {
    const mensajes = {
      401: 'Falta el JWT o el token ya no es válido.',
      403: 'Acceso denegado.',
    };
    const mensaje = mensajes[respuesta.status] ?? 'Respuesta inesperada al consultar ventas.';
    throw Object.assign(new Error('HTTP ' + respuesta.status + ': ' + mensaje), { status: respuesta.status });
  }

  const ventas = await respuesta.json().catch(() => {
    throw new Error('El JSON de ventas no pudo interpretarse.');
  });
  if (!Array.isArray(ventas) || !ventas.every(esVenta)) {
    throw new Error('La API no devolvió el listado de ventas esperado.');
  }
  return ventas;
}
