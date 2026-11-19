-- NO ejecutar sin respaldo completo y restauracion comprobada en entorno aislado.
-- Respaldo futuro por DBA (contrasena interactiva; archivo privado excluido por *.dump):
-- mysqldump --user=<DBA> --password --single-transaction --routines --triggers --events venta_vehiculos > respaldo_ape04.dump
-- Restaurar y comprobar ese respaldo en un servidor aislado antes de aprobar la copia.
-- Requiere ventana sin escrituras: clientes, dos instancias Java, API y worker.
-- Precondicion: destino vacio preparado con Alembic head (0002), cuenta DBA temporal.
-- No usar mysql --force. No cambiar conexiones antes de validar y autorizar el corte.
-- El origen y su alembic_version nunca se modifican; se preservan para recuperacion.
DELIMITER //
CREATE PROCEDURE ventas_api.copiar_legado_ape04()
BEGIN
 DECLARE siguiente BIGINT;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
 IF (SELECT COUNT(*) FROM ventas_api.compradores) <> 0
    OR (SELECT COUNT(*) FROM ventas_api.ventas) <> 0 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Destino no vacio: copia cancelada';
 END IF;
 IF (SELECT COUNT(*) FROM ventas_api.alembic_version WHERE version_num='0002') <> 1
    OR (SELECT COUNT(*) FROM ventas_api.alembic_version) <> 1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Destino debe estar en revision 0002';
 END IF;
 START TRANSACTION;
 INSERT INTO ventas_api.compradores (`id`, `usuario`, `documento`, `nombre`, `correo`)
 SELECT `id`, `usuario`, `documento`, `nombre`, `correo` FROM venta_vehiculos.compradores;
 IF (SELECT COUNT(*) FROM ventas_api.compradores) <> (SELECT COUNT(*) FROM venta_vehiculos.compradores)
 OR EXISTS (SELECT 1 FROM venta_vehiculos.compradores s LEFT JOIN ventas_api.compradores d ON s.id=d.id
            WHERE d.id IS NULL OR NOT ((s.`id` <=> d.`id`) AND (s.`usuario` <=> d.`usuario`) AND (s.`documento` <=> d.`documento`) AND (s.`nombre` <=> d.`nombre`) AND (s.`correo` <=> d.`correo`))) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Diferencias en compradores: copia cancelada';
 END IF;
 INSERT INTO ventas_api.ventas (`id`, `operacion_id`, `usuario`, `comprador_id`, `vehiculo_id`, `idempotency_key`, `request_hash`, `estado`, `reserva_id`, `precio_acordado`, `moneda`, `error_status`, `error_detalle`, `notificacion`, `fecha`, `intentos_venta`, `proximo_intento_venta_utc`, `intentos_notificacion`, `proximo_intento_notificacion_utc`)
 SELECT `id`, `operacion_id`, `usuario`, `comprador_id`, `vehiculo_id`, `idempotency_key`, `request_hash`, `estado`, `reserva_id`, `precio_acordado`, `moneda`, `error_status`, `error_detalle`, `notificacion`, `fecha`, `intentos_venta`, `proximo_intento_venta_utc`, `intentos_notificacion`, `proximo_intento_notificacion_utc` FROM venta_vehiculos.ventas;
 IF (SELECT COUNT(*) FROM ventas_api.ventas) <> (SELECT COUNT(*) FROM venta_vehiculos.ventas)
 OR EXISTS (SELECT 1 FROM venta_vehiculos.ventas s LEFT JOIN ventas_api.ventas d ON s.id=d.id
            WHERE d.id IS NULL OR NOT ((s.`id` <=> d.`id`) AND (s.`operacion_id` <=> d.`operacion_id`) AND (s.`usuario` <=> d.`usuario`) AND (s.`comprador_id` <=> d.`comprador_id`) AND (s.`vehiculo_id` <=> d.`vehiculo_id`) AND (s.`idempotency_key` <=> d.`idempotency_key`) AND (s.`request_hash` <=> d.`request_hash`) AND (s.`estado` <=> d.`estado`) AND (s.`reserva_id` <=> d.`reserva_id`) AND (s.`precio_acordado` <=> d.`precio_acordado`) AND (s.`moneda` <=> d.`moneda`) AND (s.`error_status` <=> d.`error_status`) AND (s.`error_detalle` <=> d.`error_detalle`) AND (s.`notificacion` <=> d.`notificacion`) AND (s.`fecha` <=> d.`fecha`) AND (s.`intentos_venta` <=> d.`intentos_venta`) AND (s.`proximo_intento_venta_utc` <=> d.`proximo_intento_venta_utc`) AND (s.`intentos_notificacion` <=> d.`intentos_notificacion`) AND (s.`proximo_intento_notificacion_utc` <=> d.`proximo_intento_notificacion_utc`))) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Diferencias en ventas: copia cancelada';
 END IF;
 COMMIT;
 -- ALTER tiene commit implicito: solo despues de copiar y comprobar ambas tablas.
 -- Si falla, no autorizar corte; el origen sigue intacto. No repetir copia sobre destino ocupado.
 SELECT GREATEST(COALESCE(AUTO_INCREMENT,1),
  (SELECT COALESCE(MAX(id),0)+1 FROM ventas_api.compradores)) INTO siguiente
 FROM information_schema.TABLES WHERE TABLE_SCHEMA='venta_vehiculos' AND TABLE_NAME='compradores';
 SET @secuencia_sql=CONCAT('ALTER TABLE ventas_api.compradores AUTO_INCREMENT=',siguiente);
 PREPARE secuencia FROM @secuencia_sql; EXECUTE secuencia; DEALLOCATE PREPARE secuencia;
 SELECT GREATEST(COALESCE(AUTO_INCREMENT,1),
  (SELECT COALESCE(MAX(id),0)+1 FROM ventas_api.ventas)) INTO siguiente
 FROM information_schema.TABLES WHERE TABLE_SCHEMA='venta_vehiculos' AND TABLE_NAME='ventas';
 SET @secuencia_sql=CONCAT('ALTER TABLE ventas_api.ventas AUTO_INCREMENT=',siguiente);
 PREPARE secuencia FROM @secuencia_sql; EXECUTE secuencia; DEALLOCATE PREPARE secuencia;
END//
DELIMITER ;
CALL ventas_api.copiar_legado_ape04();
-- La rutina temporal queda para inspeccion; su retirada requiere autorizacion posterior.
-- Validar tambien FK, indices, secuencias y pruebas P01-P13/P27 antes del corte.
-- Recuperacion: no volver al origen tras nuevas escrituras sin reconciliar los datos.
