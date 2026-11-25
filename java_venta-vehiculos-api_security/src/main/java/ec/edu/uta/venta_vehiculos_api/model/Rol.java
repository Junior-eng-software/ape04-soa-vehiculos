package ec.edu.uta.venta_vehiculos_api.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "roles")
public class Rol {
    @Id
    @Column(length = 30, nullable = false)
    private String nombre;

    @Column(length = 255, nullable = false)
    private String descripcion;

    @Column(name = "rol_base", length = 8, nullable = false)
    private String rolBase;

    @Column(name = "es_sistema", nullable = false)
    private boolean esSistema;

    protected Rol() {}

    public Rol(String nombre, String descripcion, String rolBase, boolean esSistema) {
        this.nombre = nombre;
        this.descripcion = descripcion;
        this.rolBase = rolBase;
        this.esSistema = esSistema;
    }

    public String getNombre() { return nombre; }
    public String getDescripcion() { return descripcion; }
    public String getRolBase() { return rolBase; }
    public boolean isEsSistema() { return esSistema; }
}
