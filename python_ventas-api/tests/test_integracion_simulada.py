"""Pruebas con SQLite temporal y servicios HTTP simulados; NO reemplazan a Java/MySQL reales."""
import importlib
import os
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest
import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine as sqlalchemy_create_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture
def sistema(monkeypatch):
    # Arranca con una base SQLite aislada y conexión compartida en memoria.
    engine = sqlalchemy_create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    # La app sigue generando la URL de MySQL, pero para la prueba utiliza SQLite.
    import sqlalchemy
    monkeypatch.setattr(sqlalchemy, 'create_engine', lambda *args, **kwargs: engine)
    for k,v in {'DB_USER':'pruebas','DB_HOST':'127.0.0.1','DB_NAME':'venta_vehiculos',
                'JAVA_URL':'http://127.0.0.1:8080', 'VENTAS_SERVICE_KEY':'clave_prueba_java_con_32_caracteres_1234',
                'NOTIFICACIONES_URL':'http://127.0.0.1:8081','NOTIFICACIONES_KEY':'clave_prueba_notif_con_32_caracteres_123'}.items():
        monkeypatch.setenv(k,v)
    # Fuerza a cargar los módulos para usar el motor temporal de pruebas.
    for name in list(sys.modules):
        if name == 'app' or name.startswith('app.'):
            del sys.modules[name]
    from app.db import Base
    from app import models
    # Simula una colación que equipara nombres con distintas mayúsculas.
    for modelo in (models.Comprador, models.Venta):
        modelo.__table__.c.usuario.type.collation = 'NOCASE'
    Base.metadata.create_all(engine)
    from app.main import app
    import app.services.venta_service as svc
    import app.security as sec
    import app.clients.vehiculos_client as veh
    # Servidor Java simulado con las mismas rutas y estados de reserva del contrato real.
    estado={'reservas':{},'vehiculos':{1:'DISPONIBLE',2:'DISPONIBLE'},'avisos':[], 'notificaciones_activas':True}
    def identidad(url, **kw):
        assert url.endswith('/api/identidad')
        auth = kw['headers']['Authorization']
        operador = {'usuario': 'operador', 'roles': ['ROLE_OPERADOR']}
        permiso = ['ventas:crear']
        identidades = {
            'Bearer valido': {**operador, 'permisos': permiso},
            'Bearer admin': {'usuario': 'admin', 'roles': ['ROLE_ADMIN'], 'permisos': permiso},
            'Bearer legado': operador,
            'Bearer sin_permiso': {**operador, 'permisos': []},
            'Bearer permiso_malformado': {**operador, 'permisos': 'ventas:crear'},
            'Bearer permiso_distinto': {**operador, 'permisos': ['ventas:crear:otro']},
            'Bearer consulta': {'usuario': 'lector', 'roles': ['ROLE_CONSULTA'], 'permisos': []},
            'Bearer consulta_con_permiso': {'usuario': 'lector', 'roles': ['ROLE_CONSULTA'], 'permisos': permiso},
            'Bearer sin_datos': {'usuario': 'nuevo', 'roles': ['ROLE_OPERADOR']},
            'Bearer rol_ajeno': {'usuario': 'operador', 'roles': ['ROLE_SERVICIO_VENTAS']},
        }
        if auth in identidades:
            return httpx.Response(200, json=identidades[auth])
        return httpx.Response(401,json={'error':'token inválido'})
    def java(method,url,**kw):
        assert kw['headers']['X-Service-Key']=='clave_prueba_java_con_32_caracteres_1234'
        route=url.split(':8080')[-1]
        if method=='GET' and route=='/api/reservas':
            op=kw['params']['operacionId'];r=estado['reservas'].get(op)
            return httpx.Response(200,json=r) if r else httpx.Response(404,json={'error':'no existe'})
        if method=='POST' and route.startswith('/api/vehiculos/'):
            vehiculo=int(route.split('/')[3]);op=kw['json']['operacionId']
            if vehiculo not in estado['vehiculos']:return httpx.Response(404,json={'error':'inexistente'})
            if estado['vehiculos'][vehiculo]!='DISPONIBLE':return httpx.Response(409,json={'error':'vendido'})
            estado['vehiculos'][vehiculo]='RESERVADO'
            r={'id':op,'operacionId':op,'vehiculoId':vehiculo,'precio':'18000.00','moneda':'USD','estado':'RESERVADA'}
            estado['reservas'][op]=r
            return httpx.Response(200,json=r)
        if method=='PUT' and route.endswith('/confirmacion'):
            reserva=route.split('/')[3];r=estado['reservas'][reserva]
            r['estado']='CONFIRMADA';estado['vehiculos'][r['vehiculoId']]='VENDIDO'
            return httpx.Response(200,json=r)
        raise AssertionError(f'Ruta inesperada: {method} {route}')
    def avisar(url,**kw):
        assert kw['headers']['X-Notification-Key']=='clave_prueba_notif_con_32_caracteres_123'
        assert url.endswith('/api/notificaciones')
        if not estado['notificaciones_activas']:raise httpx.ConnectError('apagado')
        estado['avisos'].append(kw['json'])
        return httpx.Response(201,json={'estado':'ENVIADA'})
    monkeypatch.setattr(httpx,'get',identidad)
    monkeypatch.setattr(httpx,'request',java)
    monkeypatch.setattr(httpx,'post',avisar)
    return TestClient(app),estado


@pytest.mark.parametrize('token', ['valido', 'admin'])
def test_venta_con_jwt_e_idempotencia(sistema, token):
    client,estado=sistema
    assert client.get('/health').json()=={'status':'UP'}
    auth={'Authorization': f'Bearer {token}'}
    comprador=client.post('/api/compradores',json={'documento':'1801111111','nombre':'Ana','correo':'ana@ejemplo.com'},headers=auth)
    assert comprador.status_code==201, comprador.text
    cid=comprador.json()['id']
    headers={**auth,'Idempotency-Key':'laboratorio0001'}
    payload={'vehiculoId':1,'compradorId':cid}
    creado=client.post('/api/ventas',json=payload,headers=headers)
    assert creado.status_code==201, creado.text
    assert creado.json()['estado']=='COMPLETADA'
    assert creado.json()['notificacion']=='ENVIADA'
    assert estado['vehiculos'][1]=='VENDIDO'
    assert len(estado['avisos'])==1
    mismo=client.post('/api/ventas',json=payload,headers=headers)
    assert mismo.status_code==200 and mismo.json()['id']==creado.json()['id']
    assert len(estado['avisos'])==1
    incorrecto=client.post('/api/ventas',json={'vehiculoId':2,'compradorId':cid},headers=headers)
    assert incorrecto.status_code==409
    no_disponible=client.post('/api/ventas',json=payload,headers={**auth,'Idempotency-Key':'laboratorio0002'})
    assert no_disponible.status_code==409


@pytest.mark.parametrize(('token', 'codigo'), [
    ('legado', 403),
    ('sin_permiso', 403),
    ('permiso_malformado', 403),
    ('permiso_distinto', 403),
    ('consulta', 403),
    ('consulta_con_permiso', 403),
    ('invalido', 401),
    ('vencido', 401),
])
def test_rechaza_venta_antes_de_crear_reserva(sistema, token, codigo):
    client, estado = sistema
    comprador = client.post(
        '/api/compradores',
        json={'documento': '1801111111', 'nombre': 'Ana', 'correo': 'ana@ejemplo.com'},
        headers={'Authorization': 'Bearer legado'},
    )
    assert comprador.status_code == 201
    rechazo = client.post(
        '/api/ventas',
        json={'vehiculoId': 1, 'compradorId': comprador.json()['id']},
        headers={'Authorization': f'Bearer {token}', 'Idempotency-Key': 'laboratorio0004'},
    )
    assert rechazo.status_code == codigo
    assert estado['reservas'] == {}
    assert estado['vehiculos'][1] == 'DISPONIBLE'
    assert estado['avisos'] == []
    from app.db import SessionLocal
    from app.models import Venta
    with SessionLocal() as db:
        assert db.query(Venta).count() == 0


def test_seguridad_validaciones_y_reenvio(sistema):
    client,estado=sistema
    data={'documento':'1805555555','nombre':'Ana','correo':'ana@ejemplo.com'}
    assert client.post('/api/compradores',json=data).status_code==401
    assert client.post('/api/compradores',json=data,headers={'Authorization':'Bearer consulta'}).status_code==403
    auth={'Authorization':'Bearer valido'}
    assert client.post('/api/compradores',json={'nombre':'Ana'},headers=auth).status_code==422
    cid=client.post('/api/compradores',json=data,headers=auth).json()['id']
    estado['notificaciones_activas']=False
    venta=client.post('/api/ventas',json={'vehiculoId':2,'compradorId':cid},headers={**auth,'Idempotency-Key':'laboratorio0003'})
    assert venta.status_code==201
    assert venta.json()['notificacion']=='PENDIENTE'
    estado['notificaciones_activas']=True
    from app.worker import ciclo
    ciclo()
    compr=client.get(f"/api/ventas/{venta.json()['id']}",headers={'Authorization':'Bearer legado'})
    assert compr.status_code==200
    assert compr.json()['notificacion']=='ENVIADA'
    assert len(estado['avisos'])==1


@pytest.fixture
def registros_visibles(sistema):
    from app.db import SessionLocal
    from app.models import Comprador, Venta

    with SessionLocal.begin() as db:
        db.add_all([
            Comprador(id=1, usuario='operador', nombre='Comprador uno',
                      documento='PRUEBA-1', correo='uno@example.test'),
            Comprador(id=2, usuario='OPERADOR', nombre='Comprador dos',
                      documento='PRUEBA-2', correo='dos@example.test'),
            Comprador(id=3, usuario='admin', nombre='Comprador tres',
                      documento='PRUEBA-3', correo='tres@example.test'),
        ])
        db.flush()
        for id_, usuario, comprador_id in [
            (1, 'operador', 1), (2, 'lector', 3), (3, 'OPERADOR', 2), (4, 'admin', 1),
        ]:
            db.add(Venta(
                id=id_, usuario=usuario, comprador_id=comprador_id, vehiculo_id=id_ + 100,
                operacion_id=f'operacion-prueba-{id_}', idempotency_key=f'clave-prueba-{id_}',
                request_hash='0' * 64, fecha=datetime(2024, 1, 2, 12, 30),
                estado='PENDIENTE' if id_ == 2 else 'COMPLETADA',
                precio_acordado=None if id_ == 2 else Decimal('18000.00'),
                moneda=None if id_ == 2 else 'USD',
            ))
    return sistema


@pytest.mark.parametrize(('token', 'codigo', 'ids'), [
    ('consulta', 403, []),
    ('legado', 200, [1]),
    ('admin', 200, [1, 2, 3]),
    ('sin_datos', 200, []),
    ('rol_ajeno', 403, []),
])
def test_lista_compradores_segun_rol(registros_visibles, token, codigo, ids):
    client, _ = registros_visibles
    respuesta = client.get('/api/compradores', headers={'Authorization': f'Bearer {token}'})
    assert respuesta.status_code == codigo
    if codigo == 200:
        nombres = {1: 'Comprador uno', 2: 'Comprador dos', 3: 'Comprador tres'}
        assert respuesta.json() == [{'id': id_, 'nombre': nombres[id_]} for id_ in ids]


@pytest.mark.parametrize(('token', 'ids'), [
    ('consulta', [2]), ('legado', [1]), ('admin', [1, 2, 3, 4]), ('sin_datos', []),
])
def test_lista_ventas_segun_rol_y_contrato(registros_visibles, token, ids):
    client, estado = registros_visibles
    headers = {'Authorization': f'Bearer {token}'}
    respuesta = client.get('/api/ventas', headers=headers)
    assert respuesta.status_code == 200
    campos = {'id', 'vehiculoId', 'compradorId', 'estado', 'precioAcordado', 'moneda', 'fechaUTC'}
    assert [venta['id'] for venta in respuesta.json()] == ids
    for venta in respuesta.json():
        assert set(venta) == campos
        detalle = client.get(f"/api/ventas/{venta['id']}", headers=headers)
        assert detalle.status_code == 200
        assert venta == {campo: detalle.json()[campo] for campo in campos}
    if token == 'legado':
        assert client.get('/api/ventas/3', headers=headers).status_code == 403
    if token == 'consulta':
        venta = respuesta.json()[0]
        assert (venta['estado'], venta['precioAcordado'], venta['moneda']) == ('PENDIENTE', None, None)
        assert client.get('/api/ventas/1', headers=headers).status_code == 403
    assert estado['reservas'] == {}
    assert estado['avisos'] == []


@pytest.mark.parametrize('ruta', ['/api/compradores', '/api/ventas'])
@pytest.mark.parametrize(('auth', 'codigo'), [
    ({}, 401),
    ({'Authorization': 'Bearer invalido'}, 401),
    ({'Authorization': 'Bearer rol_ajeno'}, 403),
])
def test_listados_rechazan_acceso_no_autorizado(sistema, ruta, auth, codigo):
    client, _ = sistema
    assert client.get(ruta, headers=auth).status_code == codigo


def test_filtro_de_propietario_con_dialecto_mysql(sistema):
    from sqlalchemy import select
    from sqlalchemy.dialects import mysql
    from app.models import Venta
    from app.security import filtrar_visibles

    consulta = filtrar_visibles(
        select(Venta.id), Venta.usuario, {'usuario': 'operador', 'roles': ['ROLE_OPERADOR']},
    )
    compilada = consulta.compile(dialect=mysql.dialect())
    assert 'ventas.usuario = %s AND CAST(ventas.usuario AS BINARY) = CAST(%s AS BINARY)' in str(compilada)
    assert list(compilada.params.values()) == ['operador', 'operador']
