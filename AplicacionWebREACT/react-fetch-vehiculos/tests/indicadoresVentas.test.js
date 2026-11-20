import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularIndicadores } from '../src/indicadoresVentas.js';

const venta = (id, cambios = {}) => ({
  id, vehiculoId: id, compradorId: 1, estado: 'COMPLETADA',
  precioAcordado: '0.10', moneda: 'USD', fechaUTC: '2026-04-05T05:00:00Z',
  ...cambios,
});

test('separa estados e importes por moneda con aritmética decimal exacta', () => {
  const r = calcularIndicadores([
    venta(1), venta(2, { precioAcordado: '0.20' }),
    venta(3, { precioAcordado: '9999999999.99', moneda: 'EUR' }),
    venta(4, { precioAcordado: '0.02', moneda: 'EUR' }),
    venta(5, { estado: 'PENDIENTE', precioAcordado: '50.00' }),
    venta(6, { estado: 'EN_REVISION' }), venta(7, { estado: 'FALLIDA' }),
  ]);
  assert.equal(r.ventasVisibles, 7);
  assert.equal(r.completadas, 4);
  assert.deepEqual(r.porEstado, { COMPLETADA: 4, PENDIENTE: 1, EN_REVISION: 1, FALLIDA: 1 });
  assert.deepEqual(r.importesPorMoneda, { USD: '0.30', EUR: '10000000000.01' });
});

test('agrupa por fecha de registro de Guayaquil y descarta fechas inválidas', () => {
  const fechas = [
    '2026-04-05T04:59:59.999999Z', '2026-04-05T05:00:00.000001Z',
    '2026-02-30T05:00:00Z', '2026-04-05T24:00:00Z', null, '2026-04-05',
  ];
  const ventas = fechas.map((fechaUTC, i) => venta(i + 1, { fechaUTC }));
  const r = calcularIndicadores(ventas);
  assert.deepEqual(r.registrosPorDia, { '2026-04-04': 1, '2026-04-05': 1 });
  assert.equal(r.registrosSinFecha, 4);
  assert.deepEqual(ventas.map((v) => v.fechaUTC), fechas);
});

test('mantiene completadas sin datos monetarios fuera del total', () => {
  const r = calcularIndicadores([
    venta(1, { precioAcordado: null }), venta(2, { precioAcordado: '12.345' }),
    venta(3, { moneda: null }), venta(4, { precioAcordado: 2 }),
    venta(5, { moneda: 'invalid' }), venta(6, { precioAcordado: '1.2' }),
  ]);
  assert.equal(r.completadas, 6);
  assert.equal(r.completadasSinImporte, 5);
  assert.deepEqual(r.importesPorMoneda, { USD: '1.20' });
});

test('deduplica copias y excluye identificadores ambiguos o inválidos', () => {
  const r = calcularIndicadores([
    venta(1), venta(1), venta(2), venta(2, { estado: 'FALLIDA' }), venta(2),
    null, venta(-1), venta('3'),
  ]);
  assert.equal(r.ventasVisibles, 1);
  assert.deepEqual(r.importesPorMoneda, { USD: '0.10' });
});

test('cruza solo identificadores confiables con marca y modelo del catálogo actual', () => {
  const auto = { idVehiculo: 1, marca: 'Marca', modelo: 'Modelo', estado: 'DISPONIBLE' };
  const r = calcularIndicadores([venta(1), venta(2), venta(3), venta(4)], [
    auto, { ...auto }, { ...auto, idVehiculo: 2, estado: 'VENDIDO' },
    { ...auto, idVehiculo: 3 }, { ...auto, idVehiculo: 3, modelo: 'Distinto' },
  ]);
  assert.equal(r.vehiculosDisponibles, 1);
  assert.deepEqual(r.ventasPorMarcaModelo, [{ marca: 'Marca', modelo: 'Modelo', cantidad: 2 }]);
  assert.equal(r.ventasSinCruce, 2);
});

test('distingue un catálogo no consultado de listas consultadas vacías', () => {
  const r = calcularIndicadores([]);
  assert.equal(r.ventasVisibles, 0);
  assert.equal(r.completadas, 0);
  assert.deepEqual(r.porEstado, {});
  assert.deepEqual(r.importesPorMoneda, {});
  assert.deepEqual(r.registrosPorDia, {});
  assert.equal(r.vehiculosDisponibles, null);
  assert.equal(r.ventasPorMarcaModelo, null);
  assert.equal(calcularIndicadores([], []).vehiculosDisponibles, 0);
  assert.deepEqual(calcularIndicadores([], []).ventasPorMarcaModelo, []);
});
