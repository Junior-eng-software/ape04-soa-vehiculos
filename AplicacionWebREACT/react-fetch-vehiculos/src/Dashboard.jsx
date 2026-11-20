import { useMemo, useState } from 'react';
import { calcularIndicadores, rangoDelPeriodo } from './indicadoresVentas.js';

const nombresEstado = {
  COMPLETADA: 'Completada', EN_REVISION: 'En revisión', PENDIENTE: 'Pendiente', FALLIDA: 'Fallida',
};
const ordenEstados = Object.keys(nombresEstado);
const coloresEstado = ['var(--estado-completada)', 'var(--estado-revision)', 'var(--estado-pendiente)', 'var(--estado-fallida)'];
const numero = new Intl.NumberFormat('es-EC');
const decimal = new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fechaCompleta = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long', timeZone: 'UTC' });
const porcentaje = new Intl.NumberFormat('es-EC', { style: 'percent', maximumFractionDigits: 1 });

function nombreEstado(estado) {
  return Object.hasOwn(nombresEstado, estado) ? nombresEstado[estado] : estado;
}

function Indicadores({ datos, inventario, estadoCatalogo }) {
  const importes = Object.entries(datos?.importesPorMoneda ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const notaInventario = inventario?.total
    ? `${porcentaje.format(inventario.disponibles / inventario.total)} de ${numero.format(inventario.total)} ${inventario.total === 1 ? 'vehículo' : 'vehículos'}`
    : { listo: 'Catálogo vacío', error: 'Catálogo no disponible', cargando: 'Cargando catálogo…', inicial: 'Catálogo sin consultar' }[estadoCatalogo];
  return (
    <dl className="indicadores">
      <div className="indicador indicador-destacado">
        <dt>Importe completado</dt>
        <dd>
          {importes.length === 0 ? '—' : importes.map(([moneda, total]) => (
            <span key={moneda} className="importe"><small>{moneda}</small> {decimal.format(total)}</span>
          ))}
        </dd>
        {datos?.completadasSinImporte > 0 && (
          <dd className="indicador-nota">{numero.format(datos.completadasSinImporte)} sin importe o moneda válidos</dd>
        )}
      </div>
      <div className="indicador">
        <dt>Ventas visibles</dt>
        <dd>{datos ? numero.format(datos.ventasVisibles) : '—'}</dd>
      </div>
      <div className="indicador">
        <dt>Completadas</dt>
        <dd>{datos ? numero.format(datos.completadas) : '—'}</dd>
      </div>
      <div className="indicador">
        <dt>Inventario disponible</dt>
        <dd>{inventario ? numero.format(inventario.disponibles) : '—'}</dd>
        <dd className="indicador-nota">{notaInventario}</dd>
      </div>
    </dl>
  );
}

function Evolucion({ registros, sinFecha, aviso }) {
  const dias = Object.entries(registros ?? {}).map(([dia, cantidad]) => ({
    dia, cantidad, fecha: Date.parse(`${dia}T00:00:00Z`),
  }));
  return (
    <section className="panel grafico" aria-labelledby="titulo-evolucion">
      <h2 id="titulo-evolucion">Registros diarios de ventas</h2>
      <p className="muted">Días con registros · America/Guayaquil</p>
      {dias.length ? <BarrasDiarias dias={dias} />
        : <p className="grafico-vacio">{aviso || 'No hay registros con fecha válida.'}</p>}
      {sinFecha > 0 && <p className="nota-grafico">{numero.format(sinFecha)} sin fecha válida.</p>}
    </section>
  );
}

function BarrasDiarias({ dias }) {
  const maximo = dias.reduce((max, { cantidad }) => Math.max(max, cantidad), 1);
  const intervalo = Math.ceil(maximo / 4);
  const divisiones = Math.ceil(maximo / intervalo);
  const techo = divisiones * intervalo;
  const marcas = Array.from({ length: divisiones + 1 }, (_, i) => techo - i * intervalo);
  const y = (cantidad) => 100 - cantidad / techo * 100;
  const espacio = 1000 / dias.length;
  const ancho = Math.min(65, espacio * 0.62);

  return (
    <>
      <div className="diario-scroll">
        <div className="diario-grafico" style={{ minWidth: dias.length * 12 + 34 }} aria-hidden="true">
          <div className="diario-escala">
            {marcas.map((marca) => <span key={marca} style={{ top: `${y(marca)}%` }}>{numero.format(marca)}</span>)}
          </div>
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" focusable="false">
            {marcas.map((marca) => (
              <line className="diario-guia" key={marca} x1="0" x2="1000" y1={y(marca)} y2={y(marca)} />
            ))}
            {dias.map(({ dia, fecha, cantidad }, i) => (
              <rect key={dia} className="diario-barra" x={(i + 0.5) * espacio - ancho / 2}
                y={y(cantidad)} width={ancho} height={100 - y(cantidad)}>
                <title>{`${fechaCompleta.format(fecha)}: ${numero.format(cantidad)}`}</title>
              </rect>
            ))}
          </svg>
          <div className={`diario-fechas${dias.length === 1 ? ' diario-fecha-unica' : ''}`}>
            <span>{fechaCorta.format(dias[0].fecha)}</span>
            {dias.length > 1 && <span>{fechaCorta.format(dias.at(-1).fecha)}</span>}
          </div>
        </div>
      </div>
      <details className="datos-grafico">
        <summary>Ver cifras por fecha</summary>
        <ul>
          {dias.map(({ dia, fecha, cantidad }) => (
            <li key={dia}><time dateTime={dia}>{fechaCompleta.format(fecha)}</time><strong>{numero.format(cantidad)}</strong></li>
          ))}
        </ul>
      </details>
    </>
  );
}

function segmentosDona(porEstado) {
  const estados = Object.entries(porEstado ?? {}).sort(([a], [b]) => {
    const ordenA = ordenEstados.indexOf(a);
    const ordenB = ordenEstados.indexOf(b);
    return (ordenA === -1 ? ordenEstados.length : ordenA)
      - (ordenB === -1 ? ordenEstados.length : ordenB) || a.localeCompare(b);
  });
  const total = estados.reduce((suma, [, cantidad]) => suma + cantidad, 0);
  let acumulado = 0;
  const segmentos = estados.map(([estado, cantidad], indice) => {
    const orden = ordenEstados.indexOf(estado);
    const color = coloresEstado[(orden === -1 ? indice : orden) % coloresEstado.length];
    const desde = acumulado / total * 100;
    acumulado += cantidad;
    return { estado, cantidad, color, tramo: `${color} ${desde}% ${acumulado / total * 100}%` };
  });
  return { total, segmentos };
}

function Distribucion({ porEstado, aviso }) {
  const { total, segmentos } = segmentosDona(porEstado);
  const fondo = segmentos.length > 1
    ? { backgroundImage: `conic-gradient(${segmentos.map(({ tramo }) => tramo).join(', ')})` }
    : { backgroundColor: segmentos[0]?.color };

  return (
    <section className="panel grafico" aria-labelledby="titulo-distribucion">
      <h2 id="titulo-distribucion">Ventas por estado</h2>
      {total > 0 ? (
        <div className="distribucion">
          <div className="dona" aria-hidden="true" style={fondo}>
            <div><strong>{numero.format(total)}</strong><span>Ventas</span></div>
          </div>
          <ul className="leyenda" aria-label="Cantidad por estado">
            {segmentos.map(({ estado, cantidad, color }) => (
              <li key={estado}>
                <span className="punto-leyenda" style={{ backgroundColor: color }} aria-hidden="true" />
                <span>{nombreEstado(estado)}</span><strong>{numero.format(cantidad)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="grafico-vacio">{aviso || 'No hay estados que mostrar.'}</p>}
    </section>
  );
}

function VentasPorMarca({ cruces, sinCruce, aviso, error }) {
  const acumuladas = new Map();
  for (const { marca, cantidad } of cruces ?? []) {
    acumuladas.set(marca, (acumuladas.get(marca) ?? 0) + cantidad);
  }
  const marcas = [...acumuladas].sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'es'));
  const maximo = marcas[0]?.[1];

  return (
    <section className="panel grafico grafico-marcas" aria-labelledby="titulo-marcas">
      <h2 id="titulo-marcas">Registros de ventas por marca</h2>
      <p className="muted">Estados del filtro · Cruce con el catálogo actual</p>
      {marcas.length ? (
        <ul className="barras">
          {marcas.map(([marca, cantidad]) => (
            <li key={marca}>
              <span>{marca}</span>
              <div className="barra-fondo" aria-hidden="true">
                <div style={{ width: `${cantidad / maximo * 100}%` }} />
              </div>
              <strong>{numero.format(cantidad)}</strong>
            </li>
          ))}
        </ul>
      ) : <p className={`grafico-vacio${error ? ' aviso-error' : ''}`}>{aviso || 'No hay ventas vinculadas al catálogo.'}</p>}
      {sinCruce > 0 && <p className="nota-grafico">{numero.format(sinCruce)} sin coincidencia en el catálogo.</p>}
    </section>
  );
}

function InventarioPorMarca({ inventario, aviso, error }) {
  const marcas = [...(inventario?.porMarca ?? [])].sort((a, b) => a.marca.localeCompare(b.marca, 'es'));
  const maximo = marcas.reduce((max, marca) => Math.max(max, marca.disponibles, marca.vendidos), 1);

  return (
    <section className="panel grafico grafico-marcas" aria-labelledby="titulo-inventario">
      <h2 id="titulo-inventario">Inventario por marca</h2>
      <p className="muted">Estados del catálogo actual</p>
      {marcas.length ? (
        <>
          <ul className="leyenda-inventario">
            <li><span className="punto-leyenda disponible" aria-hidden="true" />Disponible</li>
            <li><span className="punto-leyenda vendido" aria-hidden="true" />Vendido</li>
          </ul>
          <ul className="barras barras-inventario">
            {marcas.map(({ marca, disponibles, vendidos }) => (
              <li key={marca}>
                <span>{marca}</span>
                <div className="pares-inventario">
                  {[[disponibles, 'Disponible', 'disponible'], [vendidos, 'Vendido', 'vendido']].map(([cantidad, estado, clase]) => (
                    <div className="par-inventario" key={estado}>
                      <span className="solo-lectores">{estado}: </span>
                      <div className="barra-fondo" aria-hidden="true">
                        <div className={clase} style={{ width: `${cantidad / maximo * 100}%` }} />
                      </div>
                      <strong>{numero.format(cantidad)}</strong>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : <p className={`grafico-vacio${error ? ' aviso-error' : ''}`}>{aviso || 'No hay vehículos disponibles o vendidos con marca válida.'}</p>}
    </section>
  );
}

export default function Dashboard({ ventas, catalogo }) {
  const [periodo, setPeriodo] = useState('');
  const [estado, setEstado] = useState('');
  const estados = useMemo(() => [
    ...new Set(ventas.datos?.map((venta) => venta?.estado).filter((valor) => typeof valor === 'string' && valor.trim())),
  ].sort((a, b) => nombreEstado(a).localeCompare(nombreEstado(b), 'es')), [ventas.datos]);
  const estadoActivo = estados.includes(estado) ? estado : '';
  const indicadores = useMemo(() => {
    const rango = periodo ? rangoDelPeriodo(Number(periodo)) : {};
    return calcularIndicadores(ventas.datos ?? [], catalogo.datos?.vehiculos, { estado: estadoActivo, ...rango });
  }, [ventas.datos, catalogo.datos, periodo, estadoActivo]);
  const datos = ventas.estado === 'listo' ? indicadores : null;
  const aviso = {
    inicial: 'Pega el JWT y consulta el dashboard.',
    cargando: 'Cargando ventas…',
    error: ventas.mensaje,
    listo: datos?.ventasVisibles ? '' : 'No hay ventas visibles para estos filtros.',
  }[ventas.estado];
  const avisoGrafico = ventas.estado === 'error' ? 'Datos de ventas no disponibles.' : aviso;
  const avisoCatalogo = {
    inicial: 'Consulta el catálogo para cruzar las marcas.',
    cargando: 'Cargando catálogo…',
    error: catalogo.mensaje,
  }[catalogo.estado];
  const lider = datos?.modeloLider;

  return (
    <>
      <section className="filtros" aria-labelledby="titulo-filtros">
        <h2 id="titulo-filtros">Filtros de ventas</h2>
        <label>Período de registro
          <select value={periodo} onChange={(evento) => setPeriodo(evento.target.value)} disabled={!datos}>
            <option value="">Todo el período</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
        <label>Estado
          <select value={estadoActivo} onChange={(evento) => setEstado(evento.target.value)} disabled={!estados.length}>
            <option value="">Todos los estados</option>
            {estados.map((opcion) => <option key={opcion} value={opcion}>{nombreEstado(opcion)}</option>)}
          </select>
        </label>
      </section>
      <div role="status" aria-live="polite">
        {aviso && <p className={`aviso aviso-dashboard${ventas.estado === 'error' ? ' aviso-error' : ''}`}>{aviso}</p>}
        {datos?.ventasVisibles > 0 && <span className="solo-lectores">{numero.format(datos.ventasVisibles)} ventas visibles.</span>}
      </div>
      <Indicadores datos={datos} inventario={indicadores.inventario} estadoCatalogo={catalogo.estado} />
      {lider && (
        <p className="modelo-lider">
          <strong>Modelo más vendido:</strong> {lider.vehiculo.join(' ')} · {numero.format(lider.cantidad)} {lider.cantidad === 1 ? 'venta completada' : 'ventas completadas'}
        </p>
      )}
      <div className="graficos">
        <Evolucion registros={datos?.registrosPorDia} sinFecha={datos?.registrosSinFecha} aviso={avisoGrafico} />
        <Distribucion porEstado={datos?.porEstado} aviso={avisoGrafico} />
        <VentasPorMarca cruces={datos?.ventasPorMarcaModelo}
          sinCruce={datos?.ventasSinCruce} aviso={avisoCatalogo || avisoGrafico} error={catalogo.estado === 'error'} />
        <InventarioPorMarca inventario={indicadores.inventario} aviso={avisoCatalogo} error={catalogo.estado === 'error'} />
      </div>
    </>
  );
}
