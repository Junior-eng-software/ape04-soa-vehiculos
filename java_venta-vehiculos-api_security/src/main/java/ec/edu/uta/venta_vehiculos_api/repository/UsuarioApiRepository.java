package ec.edu.uta.venta_vehiculos_api.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import ec.edu.uta.venta_vehiculos_api.dto.UsuarioResumen;

import ec.edu.uta.venta_vehiculos_api.model.UsuarioApi;

public interface UsuarioApiRepository
        extends JpaRepository<UsuarioApi, Integer> {

    Optional<UsuarioApi> findByUsername(String username);

    Optional<UsuarioResumen> findResumenByUsername(String username);

    List<UsuarioResumen> findAllProjectedByOrderByUsernameAsc();

    @Modifying
    @Query("update UsuarioApi u set u.password = :password where u.id = :id")
    int cambiarClave(@Param("id") int id, @Param("password") String password);
}
