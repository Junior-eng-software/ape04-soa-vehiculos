export default function Ventas({ resultado }) {
  const { estado, datos: ventas = [], mensaje } = resultado;
  const avisos = {
    inicial: 'Consulta el listado para ver las ventas.',
    cargando: 'Consultando ventas…',
    listo: ventas.length === 0 ? 'No hay ventas visibles.' : `${ventas.length} ventas visibles.`,
    error: mensaje,
  };

  return (
    <section className="panel" aria-labelledby="titulo-ventas">
      <h2 id="titulo-ventas">Ventas</h2>
      <p className={`aviso${estado === 'error' ? ' aviso-error' : ''}`} role="status">{avisos[estado]}</p>
      {ventas.length > 0 && (
        <div className="tabla-scroll" role="region" aria-label="Tabla de ventas" tabIndex={0}>
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
