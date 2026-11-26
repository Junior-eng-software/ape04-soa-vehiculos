import { useState } from 'react';

const dinero = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });

function mostrarPrecio(precio) {
  if (precio === null || precio === undefined || precio === '') return '—';
  const numero = Number(precio);
  return Number.isFinite(numero) ? dinero.format(numero) : String(precio);
}

export default function Vehiculos({ resultado }) {
  const [marca, setMarca] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const { estado, datos, mensaje } = resultado;
  const vehiculos = datos?.vehiculos ?? [];
  const visibles = vehiculos.filter((vehiculo) =>
    String(vehiculo.marca ?? '').toLowerCase().includes(marca.trim().toLowerCase()),
  );
  const detalle = seleccionado?.datos === datos ? seleccionado?.vehiculo : null;
  const aviso = {
    inicial: 'Consulta el catálogo para ver los vehículos.',
    cargando: 'Cargando vehículos…',
    error: mensaje,
    listo: vehiculos.length ? 'No hay vehículos que coincidan con la marca.' : 'El catálogo está vacío.',
  };

  return (
    <>
      <section className="panel" aria-labelledby="titulo-listado">
        <div className="titulo-listado">
          <div>
            <h2 id="titulo-listado">Vehículos</h2>
            {estado === 'listo' && <p>{visibles.length} visibles de {vehiculos.length} · HTTP {datos.codigoHttp}</p>}
          </div>
          <label htmlFor="filtroMarca">Filtrar por marca
            <input id="filtroMarca" type="search" placeholder="Ejemplo: Toyota"
              value={marca} onChange={(evento) => setMarca(evento.target.value)}
              disabled={estado === 'cargando'} />
          </label>
        </div>

        {visibles.length > 0 ? (
          <div className="tabla-scroll" role="region" aria-label="Tabla de vehículos" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">ID</th><th scope="col">Marca</th><th scope="col">Modelo</th>
                  <th scope="col">Precio</th><th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((vehiculo, indice) => (
                  <tr key={vehiculo.idVehiculo ?? vehiculo.id ?? indice}>
                    <td>
                      <button type="button" className="enlace-id"
                        onClick={() => setSeleccionado({ datos, vehiculo })}
                        aria-label={`Ver detalle del vehículo ${vehiculo.idVehiculo ?? vehiculo.id ?? ''}`}>
                        {vehiculo.idVehiculo ?? vehiculo.id ?? '—'}
                      </button>
                    </td>
                    <td>{vehiculo.marca ?? '—'}</td>
                    <td>{vehiculo.modelo ?? '—'}</td>
                    <td>{mostrarPrecio(vehiculo.precio)}</td>
                    <td>{vehiculo.estado ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`aviso${estado === 'error' ? ' aviso-error' : ''}`} role="status">
            {aviso[estado]}
          </p>
        )}
      </section>
      <section className="panel" aria-labelledby="titulo-detalle">
        <h2 id="titulo-detalle">Detalle del vehículo</h2>
        {detalle ? (
          <dl className="detalle">
            <div><dt>ID</dt><dd>{detalle.idVehiculo ?? detalle.id ?? '—'}</dd></div>
            <div><dt>Marca</dt><dd>{detalle.marca ?? '—'}</dd></div>
            <div><dt>Modelo</dt><dd>{detalle.modelo ?? '—'}</dd></div>
            <div><dt>Precio</dt><dd>{mostrarPrecio(detalle.precio)}</dd></div>
            <div><dt>Estado</dt><dd>{detalle.estado ?? '—'}</dd></div>
          </dl>
        ) : <p className="muted">Selecciona el ID de una fila para ver sus datos.</p>}
      </section>
    </>
  );
}
