import { useEffect, useRef, useState } from 'react';
import { listarVentas } from './api/ventasApi.js';
import { calcularIndicadores } from './indicadoresVentas.js';

export default function Ventas({ token, vehiculos }) {
  const solicitud = useRef(null);
  const [resultado, setResultado] = useState({ estado: 'inicial', ventas: [] });

  useEffect(() => () => solicitud.current?.abort(), []);

  async function consultar() {
    solicitud.current?.abort();
    const controlador = new AbortController();
    solicitud.current = controlador;
    setResultado({ estado: 'cargando', ventas: [] });

    try {
      const ventas = await listarVentas(token, controlador.signal);
      if (!controlador.signal.aborted) setResultado({ estado: 'listo', ventas });
    } catch (error) {
      if (!controlador.signal.aborted) {
        setResultado({ estado: 'error', ventas: [], mensaje: error.message });
      }
    }
  }

  const { estado, ventas, mensaje } = resultado;
  const indicadores = estado === 'listo' ? calcularIndicadores(ventas, vehiculos) : null;
  const avisos = {
    inicial: 'Presione Consultar ventas para cargar el listado.',
    cargando: 'Consultando ventas...',
    listo: ventas.length === 0 ? 'No hay ventas visibles.' : `${ventas.length} ventas visibles.`,
    error: mensaje,
  };

  return (
    <section className="panel" aria-labelledby="titulo-ventas">
      <h2 id="titulo-ventas">4. Ventas</h2>
      <div className="acciones">
        <button type="button" onClick={consultar} disabled={estado === 'cargando'}>
          Consultar ventas
        </button>
      </div>
      <div className={estado === 'error' ? 'estado estado-error' : 'estado estado-ok'} role="status">
        <span>{avisos[estado]}</span>
      </div>
      {indicadores && (
        <dl className="detalle">
          <div><dt>Ventas completadas</dt><dd>{indicadores.completadas}</dd></div>
          {Object.entries(indicadores.importesPorMoneda).map(([moneda, importe]) => (
            <div key={moneda}><dt>Importe completado ({moneda})</dt><dd>{importe}</dd></div>
          ))}
          {indicadores.completadasSinImporte > 0 && (
            <div><dt>Completadas sin importe o moneda válidos</dt><dd>{indicadores.completadasSinImporte}</dd></div>
          )}
          {indicadores.vehiculosDisponibles !== null && (
            <div><dt>Vehículos disponibles</dt><dd>{indicadores.vehiculosDisponibles}</dd></div>
          )}
        </dl>
      )}
      {ventas.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Vehículo ID</th>
                <th scope="col">Comprador ID</th>
                <th scope="col">Estado</th>
                <th scope="col">Precio acordado</th>
                <th scope="col">Moneda</th>
                <th scope="col">Fecha UTC</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id}>
                  <td>{venta.id}</td>
                  <td>{venta.vehiculoId}</td>
                  <td>{venta.compradorId}</td>
                  <td>{venta.estado}</td>
                  <td>{venta.precioAcordado ?? '—'}</td>
                  <td>{venta.moneda ?? '—'}</td>
                  <td>{venta.fechaUTC}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
