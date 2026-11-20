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

function resumirInventario(catalogo) {
  if (catalogo === null) return null;
  const porMarca = new Map();
  let disponibles = 0;
  for (const { marca, estado } of catalogo.values()) {
    if (estado === 'DISPONIBLE') disponibles++;
    if (typeof marca !== 'string' || !marca.trim() || (estado !== 'DISPONIBLE' && estado !== 'VENDIDO')) continue;
    const cantidades = porMarca.get(marca) ?? { marca, disponibles: 0, vendidos: 0 };
    if (estado === 'DISPONIBLE') cantidades.disponibles++;
    else cantidades.vendidos++;
    porMarca.set(marca, cantidades);
  }
  return { total: catalogo.size, disponibles, porMarca: [...porMarca.values()] };
}

export function rangoDelPeriodo(dias, ahora = new Date()) {
  const hasta = fechaLocal(ahora.toISOString());
  const inicio = new Date(`${hasta}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - dias + 1);
  return { desde: inicio.toISOString().slice(0, 10), hasta };
}

export function calcularIndicadores(ventas, vehiculos = null, { estado, desde, hasta } = {}) {
  const visibles = unicosPorId(ventas, 'id', camposVenta);
  const catalogo = vehiculos === null ? null : unicosPorId(vehiculos, 'idVehiculo', camposVehiculo);
  const porEstado = new Map();
  const registrosPorDia = new Map();
  const importes = new Map();
  const cruces = new Map();
  const crucesCompletadas = new Map();
  let completadas = 0;
  let completadasSinImporte = 0;
  let registrosSinFecha = 0;
  let ventasSinCruce = 0;
  let ventasVisibles = 0;
  let completadasCruzadas = 0;

  for (const venta of visibles.values()) {
    if (estado && venta.estado !== estado) continue;
    const dia = fechaLocal(venta.fechaUTC);
    if ((desde || hasta) && (!dia || (desde && dia < desde) || (hasta && dia > hasta))) continue;
    ventasVisibles++;
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
    if (dia) sumar(registrosPorDia, dia);
    else registrosSinFecha++;

    if (catalogo !== null) {
      const vehiculo = catalogo.get(venta.vehiculoId);
      if (typeof vehiculo?.marca === 'string' && vehiculo.marca.trim()
          && typeof vehiculo.modelo === 'string' && vehiculo.modelo.trim()) {
        const clave = JSON.stringify([vehiculo.marca, vehiculo.modelo]);
        sumar(cruces, clave);
        if (venta.estado === 'COMPLETADA') {
          sumar(crucesCompletadas, clave);
          completadasCruzadas++;
        }
      } else {
        ventasSinCruce++;
      }
    }
  }

  const inventario = resumirInventario(catalogo);
  const ranking = [...crucesCompletadas].sort(([, a], [, b]) => b - a);
  const lider = ranking[0];
  // Para afirmar un líder, todas las completadas deben cruzarse y no debe haber empate.
  const modeloLider = lider && completadasCruzadas === completadas && lider[1] !== ranking[1]?.[1]
    ? { vehiculo: JSON.parse(lider[0]), cantidad: lider[1] } : null;
  return {
    ventasVisibles,
    porEstado: Object.fromEntries(porEstado),
    completadas,
    importesPorMoneda: Object.fromEntries([...importes].map(([moneda, unidades]) => [moneda, importeDecimal(unidades)])),
    completadasSinImporte,
    registrosPorDia: Object.fromEntries([...registrosPorDia].sort(([a], [b]) => a.localeCompare(b))),
    registrosSinFecha,
    vehiculosDisponibles: inventario?.disponibles ?? null,
    inventario,
    modeloLider,
    ventasPorMarcaModelo: catalogo === null ? null : [...cruces].map(([clave, cantidad]) => {
      const [marca, modelo] = JSON.parse(clave);
      return { marca, modelo, cantidad };
    }),
    ventasSinCruce: catalogo === null ? null : ventasSinCruce,
  };
}
