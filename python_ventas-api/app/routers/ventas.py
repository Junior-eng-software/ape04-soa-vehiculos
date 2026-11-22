"""Endpoints REST de compradores y ventas."""
# Carga tipos y funciones que se utilizarán más abajo.
from typing import Annotated
# Publica endpoints web y valida solicitudes.
from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
# Importa el componente local correspondiente a esta responsabilidad.
from app.db import SessionLocal
from app.models import Venta, Comprador
from app.repositories.venta_repository import VentaRepository
from app.schemas import CompradorResumen, CrearVenta, CrearComprador, VentaResumen
from app.security import autorizar_venta, filtrar_visibles, identidad, propietario, vendedor
from app.errors import ApiError, conflicto_comprador, restriccion_duplicada
from app.services import venta_service as service
# Crea el agrupador de rutas HTTP con prefijo /api.
router = APIRouter(prefix="/api")


# Expone POST /api/compradores; cuando crea devuelve HTTP 201.
@router.post("/compradores", status_code=201)
# Recibe JSON validado y usuario autenticado por Java.
def crear_comprador(d: CrearComprador, u=Depends(identidad)):
    vendedor(u)
    try:
        with SessionLocal.begin() as db:
            # Pydantic ya recortó el correo. Usar LOWER del motor alinea el alta con el índice.
            correo = db.scalar(select(func.lower(d.correo)))
            existente = db.scalar(select(Comprador.id).where(Comprador.correo_normalizado == correo))
            if existente is not None:
                raise conflicto_comprador("uq_comprador_correo_normalizado")

            comprador = Comprador(
                usuario=u["usuario"], documento=d.documento, nombre=d.nombre, correo=correo
            )
            db.add(comprador)
            db.flush()
            return {"id": comprador.id, "nombre": comprador.nombre, "correo": comprador.correo}
    except IntegrityError as error:
        # Al salir de la transacción, SQLAlchemy ya ejecutó rollback.
        raise conflicto_comprador(restriccion_duplicada(error)) from None


@router.get("/compradores", response_model=list[CompradorResumen])
def listar_compradores(u=Depends(identidad)):
    vendedor(u)
    consulta = select(Comprador.id, Comprador.nombre).order_by(Comprador.id)
    with SessionLocal() as db:
        return db.execute(filtrar_visibles(consulta, Comprador.usuario, u)).mappings().all()


# Expone POST /api/ventas; requiere JWT con permiso de venta e Idempotency-Key.
@router.post("/ventas")
# Acepta el cuerpo validado, la respuesta y la clave idempotente.
def crear(d: CrearVenta, response: Response,
          # Declara cabecera HTTP obligatoria Idempotency-Key.
          idempotency_key: Annotated[str, Header(
              # Limita longitud y caracteres admitidos en la clave.
              min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")],
          u=Depends(autorizar_venta)):
    # Delegación: las reglas y comunicación Java viven en el Service.
    resultado, codigo = service.crear(d, idempotency_key, u)
    # Asigna 201, 200 o 202 según el resultado.
    response.status_code = codigo
    # Informa la URL REST donde puede consultarse esta venta.
    response.headers["Location"] = f"/api/ventas/{resultado['id']}"
    # Entrega el JSON generado por el servicio.
    return resultado


@router.get("/ventas", response_model=list[VentaResumen])
def listar_ventas(u=Depends(identidad)):
    if not {"ROLE_CONSULTA", "ROLE_OPERADOR", "ROLE_ADMIN"}.intersection(u["roles"]):
        raise ApiError(403, "SIN_PERMISO", "Se requiere CONSULTA, OPERADOR o ADMIN")
    with SessionLocal() as db:
        filas = VentaRepository(db).listar_visibles(u)
        return [
            VentaResumen(
                id=v.id, vehiculoId=v.vehiculo_id, compradorId=v.comprador_id,
                estado=v.estado,
                precioAcordado=str(v.precio_acordado) if v.precio_acordado is not None else None,
                moneda=v.moneda, fechaUTC=v.fecha.isoformat() + "Z",
            )
            for v in filas
        ]


# Expone GET /api/ventas/{id} para consultar la operación.
@router.get("/ventas/{id}")
# Obtiene un identificador y usuario autenticado.
def obtener(id: int, u=Depends(identidad)):
    # Gestiona automáticamente la apertura y cierre del recurso.
    with SessionLocal() as db:
        # Busca la venta mediante clave primaria.
        v = db.get(Venta, id)
        # Comprueba si la venta solicitada no existe.
        if v is None:
            # Responde 404 en vez de un error genérico.
            raise ApiError(404, "VENTA_NO_EXISTE", "Venta inexistente")
        # Restringe la consulta al dueño o administrador.
        propietario(u, v.usuario)
        # Devuelve el mismo formato JSON que POST.
        return service.salida(v)
