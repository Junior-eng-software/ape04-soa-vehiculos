import { useEffect, useState } from 'react';
import { listarVehiculos } from './api/vehiculosApi.js';
import { listarVentas } from './api/ventasApi.js';
import { cargarConsultaDeSesion, crearConsulta } from './consulta.js';
import { crearSesion, enviarIngreso, sesionInicial } from './sesion.js';
import Dashboard from './Dashboard.jsx';
import Vehiculos from './Vehiculos.jsx';
import Ventas from './Ventas.jsx';
import './index.css';
import './App.css';

const vistas = {
  dashboard: {
    nombre: 'Dashboard', titulo: 'Dashboard de ventas',
    descripcion: 'Ventas visibles para tu sesión e inventario del catálogo.',
  },
  vehiculos: {
    nombre: 'Vehículos', titulo: 'Catálogo de vehículos',
    descripcion: 'Busca por marca y selecciona un vehículo para ver su detalle.',
  },
  ventas: {
    nombre: 'Ventas', titulo: 'Listado de ventas',
    descripcion: 'Consulta las ventas autorizadas para tu sesión.',
  },
};

function useConsulta(cargar) {
  const [resultado, publicar] = useState({ estado: 'cargando' });
  const [consulta] = useState(() => crearConsulta(cargar, publicar));
  return [resultado, consulta];
}

function AreaTrabajo({ sesion, id, identidad }) {
  const [vista, setVista] = useState('dashboard');
  const [vehiculos, consultaVehiculos] = useConsulta(listarVehiculos);
  const [ventas, consultaVentas] = useConsulta(listarVentas);
  const pagina = vistas[vista];

  useEffect(() => {
    let montada = true;
    queueMicrotask(() => {
      if (!montada) return;
      cargarConsultaDeSesion(consultaVehiculos, sesion, id);
      cargarConsultaDeSesion(consultaVentas, sesion, id);
    });
    return () => {
      montada = false;
      consultaVehiculos.cancelar();
      consultaVentas.cancelar();
    };
  }, [sesion, id, consultaVehiculos, consultaVentas]);

  function reintentar() {
    if (vista !== 'ventas' && vehiculos.estado === 'error') {
      cargarConsultaDeSesion(consultaVehiculos, sesion, id);
    }
    if (vista !== 'vehiculos' && ventas.estado === 'error') {
      cargarConsultaDeSesion(consultaVentas, sesion, id);
    }
  }

  return (
    <div className="aplicacion">
      <aside className="lateral">
        <div className="identidad">
          <span className="identidad-marca" aria-hidden="true" />
          <span>Gestión<br className="identidad-salto" /> automotriz</span>
        </div>
        <nav aria-label="Navegación principal">
          {Object.entries(vistas).map(([nombre, vistaActual]) => (
            <button key={nombre} type="button" onClick={() => setVista(nombre)}
              aria-current={vista === nombre ? 'page' : undefined}>
              {vistaActual.nombre}
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
          <div className="sesion barra-sesion">
            <p>{identidad.usuario} · {identidad.rol}</p>
            <button type="button" className="secundario" onClick={() => sesion.cerrar()}>
              Cerrar sesión
            </button>
          </div>
        </header>

        <div hidden={vista !== 'dashboard'}><Dashboard ventas={ventas} catalogo={vehiculos} reintentar={reintentar} /></div>
        <div hidden={vista !== 'vehiculos'}>
          <Vehiculos resultado={vehiculos} />
          {vehiculos.estado === 'error' && <button type="button" onClick={reintentar}>Reintentar</button>}
        </div>
        <div hidden={vista !== 'ventas'}>
          <Ventas resultado={ventas} />
          {ventas.estado === 'error' && <button type="button" onClick={reintentar}>Reintentar</button>}
        </div>
      </main>
    </div>
  );
}

export function PuertaSesion({ estadoSesion, sesion }) {
  if (estadoSesion.estado === 'activa') {
    return <AreaTrabajo key={estadoSesion.id} sesion={sesion} id={estadoSesion.id} identidad={estadoSesion.identidad} />;
  }
  const verificando = estadoSesion.estado === 'verificando';
  return (
    <main className="ingreso">
      <form className="sesion ingreso-tarjeta" aria-labelledby="titulo-ingreso" aria-busy={verificando}
        onSubmit={(evento) => enviarIngreso(evento, sesion)}>
        <p className="ingreso-producto">Gestión automotriz</p>
        <h1 id="titulo-ingreso">Iniciar sesión</h1>
        <label htmlFor="usuario">Usuario</label>
        <input id="usuario" name="usuario" autoComplete="username" autoFocus readOnly={verificando} />
        <label htmlFor="clave">Contraseña</label>
        <input id="clave" name="clave" type="password" autoComplete="current-password" readOnly={verificando} />
        <button type="submit" disabled={verificando}>
          {verificando ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
        {estadoSesion.mensaje && <p className="aviso aviso-error" role="alert">{estadoSesion.mensaje}</p>}
      </form>
    </main>
  );
}

export default function App() {
  const [estadoSesion, publicar] = useState(sesionInicial);
  const [sesion] = useState(() => crearSesion({ publicar }));
  useEffect(() => sesion.limpiar, [sesion]);
  return <PuertaSesion estadoSesion={estadoSesion} sesion={sesion} />;
}
