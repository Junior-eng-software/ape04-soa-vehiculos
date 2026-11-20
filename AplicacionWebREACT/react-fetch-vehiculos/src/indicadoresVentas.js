const zonaLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const camposVenta = ['vehiculoId', 'compradorId', 'estado', 'precioAcordado', 'moneda', 'fechaUTC'];
const camposVehiculo = ['marca', 'modelo', 'estado'];

// Un ID ambiguo se excluye aunque reaparezca posteriormente.
function unicosPorId(registros, campoId, campos) {
  const unicos = new Map();
  const ambiguos = new Set();
  for (const registro of registros) {
    const id = registro?.[campoId];
    if (!Number.isSafeInteger(id) || id <= 0 || ambiguos.has(id)) continue;
    const previo = unicos.get(id);
    if (previo && campos.some((campo) => previo[campo] !== registro[campo])) {
      unicos.delete(id);
      ambiguos.add(id);
    } else {
      unicos.set(id, registro);
    }
  }
  return unicos;
}

function fechaLocal(fechaUTC) {
  if (typeof fechaUTC !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(fechaUTC)) return null;
  const fecha = new Date(fechaUTC);
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 19) !== fechaUTC.slice(0, 19)) return null;
  const partes = Object.fromEntries(zonaLocal.formatToParts(fecha).map(({ type, value }) => [type, value]));
  return `${partes.year.padStart(4, '0')}-${partes.month}-${partes.day}`;
}

function centavos(importe) {
  if (typeof importe !== 'string') return null;
  const partes = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(importe);
  if (!partes) return null;
  const [, signo, entero, decimal = ''] = partes;
  const unidades = BigInt(entero) * 100n + BigInt(decimal.padEnd(2, '0'));
  return signo === '-' ? -unidades : unidades;
}

function importeDecimal(unidades) {
  const magnitud = unidades < 0n ? -unidades : unidades;
  return `${unidades < 0n ? '-' : ''}${magnitud / 100n}.${String(magnitud % 100n).padStart(2, '0')}`;
}

function sumar(mapa, clave) {
  mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
}

export function calcularIndicadores(ventas, vehiculos = null) {
  const visibles = unicosPorId(ventas, 'id', camposVenta);
  const catalogo = vehiculos === null ? null : unicosPorId(vehiculos, 'idVehiculo', camposVehiculo);
  const porEstado = new Map();
  const registrosPorDia = new Map();
  const importes = new Map();
  const cruces = new Map();
  let completadas = 0;
  let completadasSinImporte = 0;
  let registrosSinFecha = 0;
  let ventasSinCruce = 0;

  for (const venta of visibles.values()) {
    if (typeof venta.estado === 'string' && venta.estado.trim()) sumar(porEstado, venta.estado);
    if (venta.estado === 'COMPLETADA') {
      completadas++;
      const unidades = centavos(venta.precioAcordado);
      if (unidades !== null && typeof venta.moneda === 'string' && /^[A-Z]{3}$/.test(venta.moneda)) {
        importes.set(venta.moneda, (importes.get(venta.moneda) ?? 0n) + unidades);
      } else {
        completadasSinImporte++;
      }
    }
    const dia = fechaLocal(venta.fechaUTC);
    if (dia) sumar(registrosPorDia, dia);
    else registrosSinFecha++;

    if (catalogo !== null) {
      const vehiculo = catalogo.get(venta.vehiculoId);
      if (typeof vehiculo?.marca === 'string' && vehiculo.marca.trim()
          && typeof vehiculo.modelo === 'string' && vehiculo.modelo.trim()) {
        sumar(cruces, JSON.stringify([vehiculo.marca, vehiculo.modelo]));
      } else {
        ventasSinCruce++;
      }
    }
  }

  return {
    ventasVisibles: visibles.size,
    porEstado: Object.fromEntries(porEstado),
    completadas,
    importesPorMoneda: Object.fromEntries([...importes].map(([moneda, unidades]) => [moneda, importeDecimal(unidades)])),
    completadasSinImporte,
    registrosPorDia: Object.fromEntries([...registrosPorDia].sort(([a], [b]) => a.localeCompare(b))),
    registrosSinFecha,
    vehiculosDisponibles: catalogo === null ? null
      : [...catalogo.values()].filter((vehiculo) => vehiculo.estado === 'DISPONIBLE').length,
    ventasPorMarcaModelo: catalogo === null ? null : [...cruces].map(([clave, cantidad]) => {
      const [marca, modelo] = JSON.parse(clave);
      return { marca, modelo, cantidad };
    }),
    ventasSinCruce: catalogo === null ? null : ventasSinCruce,
  };
}
