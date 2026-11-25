package ec.edu.uta.venta_vehiculos_api.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import ec.edu.uta.venta_vehiculos_api.model.Rol;

public interface RolRepository extends JpaRepository<Rol, String> {
    List<Rol> findAllByOrderByNombreAsc();

    @Modifying
    @Query(value = """
        INSERT INTO roles (nombre, descripcion, rol_base, es_sistema)
        VALUES (:nombre, :descripcion, :rolBase, 0)
        """, nativeQuery = true)
    void insertar(@Param("nombre") String nombre, @Param("descripcion") String descripcion,
                  @Param("rolBase") String rolBase);
}
