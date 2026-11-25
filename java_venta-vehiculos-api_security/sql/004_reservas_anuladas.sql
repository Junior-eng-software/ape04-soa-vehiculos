-- MariaDB 10.4. Aplicar antes de desplegar Java con anulación de reservas.
ALTER TABLE venta_vehiculos.reservas
    DROP CONSTRAINT ck_reserva_estado,
    ADD CONSTRAINT ck_reserva_estado CHECK (
        estado IN ('RESERVADA', 'CONFIRMADA', 'LIBERADA', 'ANULADA')
    );
