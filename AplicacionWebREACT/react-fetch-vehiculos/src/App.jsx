import { useEffect, useState } from 'react';
import { listarVehiculos } from './api/vehiculosApi.js';
import { listarVentas } from './api/ventasApi.js';
import { consultaInicial, crearConsulta } from './consulta.js';
import Dashboard from './Dashboard.jsx';
import Vehiculos from './Vehiculos.jsx';
import Ventas from './Ventas.jsx';
import './index.css';
import './App.css';

const vistas = {
  dashboard: {
    nombre: 'Dashboard', titulo: 'Dashboard de ventas', accion: 'Consultar dashboard',
    descripcion: 'Ventas visibles para tu sesión e inventario del catálogo.',
  },
  vehiculos: {
    nombre: 'Vehículos', titulo: 'Catálogo de vehículos', accion: 'Consultar vehículos',
    descripcion: 'Busca por marca y selecciona un vehículo para ver su detalle.',
  },
  ventas: {
    nombre: 'Ventas', titulo: 'Listado de ventas', accion: 'Consultar ventas',
    descripcion: 'Consulta las ventas autorizadas para tu sesión.',
  },
};

function useConsulta(cargar) {
  const [resultado, publicar] = useState(consultaInicial);
  const [consulta] = useState(() => crearConsulta(cargar, publicar));
  useEffect(() => consulta.cancelar, [consulta]);
  return [resultado, consulta];
}

export default function App() {
  const [vista, setVista] = useState('dashboard');
  const [token, setToken] = useState('');
  const [revision, setRevision] = useState(0);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [vehiculos, consultaVehiculos] = useConsulta(listarVehiculos);
  const [ventas, consultaVentas] = useConsulta(listarVentas);
  const pagina = vistas[vista];
  const cargando = (vista !== 'ventas' && vehiculos.estado === 'cargando')
    || (vista !== 'vehiculos' && ventas.estado === 'cargando');

  function cambiarToken(nuevoToken) {
    if (nuevoToken === token) return;
    consultaVehiculos.reiniciar();
    consultaVentas.reiniciar();
    setToken(nuevoToken);
    setRevision((actual) => actual + 1);
  }

  function consultar(evento) {
    evento.preventDefault();
    if (vista !== 'ventas') consultaVehiculos.ejecutar(token);
    if (vista !== 'vehiculos') consultaVentas.ejecutar(token);
  }

  return (
    <div className="aplicacion">
      <aside className="lateral">
        <div className="identidad">
          <span className="identidad-marca" aria-hidden="true" />
          <span>Gestión<br className="identidad-salto" /> automotriz</span>
        </div>
        <nav aria-label="Navegación principal">
          {Object.entries(vistas).map(([id, { nombre }]) => (
            <button key={id} type="button" onClick={() => setVista(id)}
              aria-current={vista === id ? 'page' : undefined}>
              {nombre}
            </button>
          ))}
        </nav>
      </aside>

      <main className="contenido" id="contenido">
        <header className="cabecera">
          <div>
            <h1>{pagina.titulo}</h1>
            <p>{pagina.descripcion}</p>
          </div>
          <form onSubmit={consultar}>
            <fieldset className="sesion">
              <legend>Sesión</legend>
              <label htmlFor="jwt">JWT de acceso</label>
              <div className="linea-token">
                <input id="jwt" type={mostrarToken ? 'text' : 'password'} autoComplete="off"
                  spellCheck="false" placeholder="Pega el token sin Bearer"
                  value={token} onChange={(evento) => cambiarToken(evento.target.value)} />
                <button type="button" className="secundario" aria-controls="jwt"
                  onClick={() => setMostrarToken((actual) => !actual)}>
                  {mostrarToken ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <div className="acciones">
                <button type="submit" disabled={cargando}>
                  {cargando ? 'Consultando…' : pagina.accion}
                </button>
                <button type="button" className="secundario" disabled={!token}
                  onClick={() => {
                    cambiarToken('');
                    setMostrarToken(false);
                  }}>
                  Limpiar token
                </button>
              </div>
            </fieldset>
          </form>
        </header>

        <div key={revision}>
          <div hidden={vista !== 'dashboard'}><Dashboard ventas={ventas} catalogo={vehiculos} /></div>
          <div hidden={vista !== 'vehiculos'}><Vehiculos resultado={vehiculos} /></div>
          <div hidden={vista !== 'ventas'}><Ventas resultado={ventas} /></div>
        </div>
      </main>
    </div>
  );
}
