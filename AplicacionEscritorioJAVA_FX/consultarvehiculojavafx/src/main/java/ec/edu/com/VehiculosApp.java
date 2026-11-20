package ec.edu.com;

import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.beans.binding.Bindings;
import javafx.beans.property.ReadOnlyObjectWrapper;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.control.TableCell;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.net.http.HttpClient;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;

public final class VehiculosApp extends Application {
    enum Seccion {
        VEHICULOS, NOTIFICACIONES;

        void actualizar(Runnable vehiculos, Runnable notificaciones) {
            switch (this) {
                case VEHICULOS -> vehiculos.run();
                case NOTIFICACIONES -> notificaciones.run();
            }
        }
    }

    private final HttpClient transporte = VehiculosApiClient.nuevoTransporte();
    private final VehiculosApiClient api = new VehiculosApiClient(transporte);
    private final NotificacionesApiClient apiNotificaciones = new NotificacionesApiClient(transporte);
    private final PasswordField txtToken = new PasswordField();
    private final Button btnActualizar = new Button("Actualizar");
    private Seccion seccion = Seccion.VEHICULOS;
    private final Label lblEstado = new Label("Listo");
    private final Label lblTotal = new Label("Total de vehículos: 0");
    private final TableView<Vehiculo> tabla = new TableView<>();
    private final TableView<AvisoVenta> tablaAvisos = new TableView<>();
    private final Label estadoAvisos = new Label();
    private final Label ultimaActualizacion = new Label();
    private final SondeoNotificaciones sondeo = new SondeoNotificaciones(
        apiNotificaciones::consultar, Platform::runLater, this::mostrarAvisos);
    private final Timeline relojAvisos = new Timeline(
        new KeyFrame(Duration.seconds(4), evento -> consultarAvisos(false)));
    private CompletableFuture<VehiculosApiClient.ResultadoConsulta> consultaVehiculos;

    @Override
    public void start(Stage ventana) {
        txtToken.setPromptText("Pega el JWT");
        txtToken.setAccessibleText("JWT de sesión");
        txtToken.setPrefColumnCount(22);
        txtToken.setMaxWidth(420);
        txtToken.setMinWidth(0);
        txtToken.textProperty().addListener((observable, anterior, nuevo) -> {
            if (!normalizarJwt(anterior).equals(normalizarJwt(nuevo))) {
                cambiarSesion(normalizarJwt(nuevo));
            }
        });

        Button cerrarSesion = new Button("Cerrar sesión");
        cerrarSesion.disableProperty().bind(Bindings.createBooleanBinding(
            () -> normalizarJwt(txtToken.getText()).isBlank(), txtToken.textProperty()));
        cerrarSesion.setOnAction(evento -> txtToken.clear());
        cerrarSesion.getStyleClass().add("accion-secundaria");
        Region espacio = new Region();
        HBox.setHgrow(espacio, Priority.ALWAYS);
        HBox cabecera = new HBox(12, titulo("Gestión automotriz", "titulo-principal"), espacio, cerrarSesion);
        cabecera.setAlignment(Pos.CENTER_LEFT);

        btnActualizar.getStyleClass().add("accion-principal");
        btnActualizar.setOnAction(evento -> seccion.actualizar(
            this::consultarVehiculos, () -> consultarAvisos(true)));
        HBox sesion = new HBox(10, titulo("Sesión", "texto-secundario"), txtToken, btnActualizar);
        HBox.setHgrow(txtToken, Priority.ALWAYS);
        sesion.setAlignment(Pos.CENTER_LEFT);
        sesion.getStyleClass().add("barra-sesion");

        Tab vehiculos = new Tab("Vehículos", crearVistaVehiculos());
        Tab avisos = new Tab("Notificaciones", crearVistaAvisos());
        TabPane secciones = new TabPane(vehiculos, avisos);
        secciones.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        secciones.getSelectionModel().selectedItemProperty().addListener((observable, anterior, activa) -> {
            seccion = activa == avisos ? Seccion.NOTIFICACIONES : Seccion.VEHICULOS;
            if (seccion == Seccion.NOTIFICACIONES) {
                consultarAvisos(false);
            }
            actualizarBoton();
        });
        actualizarBoton();
        relojAvisos.setCycleCount(Timeline.INDEFINITE);
        VBox.setVgrow(secciones, Priority.ALWAYS);
        VBox contenido = new VBox(16, cabecera, sesion, secciones);
        contenido.getStyleClass().add("espacio-trabajo");
        Scene escena = new Scene(contenido, 1040, 660);
        escena.getStylesheets().add(VehiculosApp.class.getResource("vehiculos.css").toExternalForm());
        ventana.setScene(escena);
        ventana.setMinWidth(720);
        ventana.setMinHeight(420);
        ventana.setTitle("Gestión automotriz");
        ventana.show();
    }

    private VBox crearVistaVehiculos() {
        agregarColumna(tabla, "ID", Vehiculo::idVehiculo, 65);
        agregarColumna(tabla, "Marca", Vehiculo::marca, 119);
        agregarColumna(tabla, "Modelo", Vehiculo::modelo, 135);
        agregarColumna(tabla, "Placa", Vehiculo::placa, 105);
        agregarColumna(tabla, "Chasis", Vehiculo::chasis, 165);
        agregarColumna(tabla, "Año", Vehiculo::anio, 75);
        agregarColumna(tabla, "Color", Vehiculo::color, 105);
        agregarColumna(tabla, "Precio", Vehiculo::precio, 100);
        agregarColumna(tabla, "Estado", Vehiculo::estado, 100);

        tabla.setPlaceholder(new Label("Sin vehículos para mostrar"));
        VBox.setVgrow(tabla, Priority.ALWAYS);
        VBox panel = new VBox(12, titulo("Vehículos registrados", "titulo-seccion"), tabla,
            crearBarraEstado(lblEstado, lblTotal));
        panel.getStyleClass().add("panel");
        return panel;
    }

    private VBox crearVistaAvisos() {
        var venta = agregarColumna(tablaAvisos, "Venta", AvisoVenta::ventaId, 85);
        venta.getStyleClass().add("id-venta");
        venta.setMaxWidth(115);
        var estado = agregarColumna(tablaAvisos, "Estado", AvisoVenta::estado, 150);
        estado.getStyleClass().add("estado-venta");
        agregarColumna(tablaAvisos, "Fecha y hora · Guayaquil",
            aviso -> PresentacionAvisos.fechaLocal(aviso.fechaUTC()), 230);
        var evento = agregarColumna(tablaAvisos, "ID del evento", AvisoVenta::eventoId, 160);
        evento.setCellFactory(columna -> new TableCell<>() {
            @Override
            protected void updateItem(String id, boolean vacio) {
                super.updateItem(id, vacio);
                setText(vacio || id == null ? null : PresentacionAvisos.abreviarEvento(id));
                setTooltip(vacio || id == null ? null : new Tooltip(id));
            }
        });
        tablaAvisos.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_FLEX_LAST_COLUMN);
        tablaAvisos.getColumns().forEach(columna -> columna.setSortable(false));
        tablaAvisos.setPlaceholder(titulo("Los avisos del historial aparecerán aquí", "texto-secundario"));
        actualizarEstado(PresentacionAvisos.Estado.SIN_SESION, "Introduce un JWT para consultar el historial");
        ultimaActualizacion.setText("Sin actualización");
        VBox.setVgrow(tablaAvisos, Priority.ALWAYS);
        VBox panel = new VBox(12, titulo("Historial de notificaciones", "titulo-seccion"), tablaAvisos,
            crearBarraEstado(estadoAvisos, ultimaActualizacion));
        panel.getStyleClass().add("panel");
        return panel;
    }

    private static HBox crearBarraEstado(Label estado, Label detalle) {
        estado.setWrapText(true);
        estado.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(estado, Priority.ALWAYS);
        detalle.getStyleClass().add("texto-secundario");
        HBox barra = new HBox(16, estado, detalle);
        barra.setAlignment(Pos.CENTER_LEFT);
        barra.getStyleClass().add("barra-estado");
        return barra;
    }

    private void consultarAvisos(boolean manual) {
        if (manual && sondeo.puedeActualizar()) {
            actualizarEstado(PresentacionAvisos.Estado.CARGA, "Cargando historial…");
        }
        sondeo.actualizar();
        actualizarBoton();
    }

    private void actualizarBoton() {
        boolean sinToken = normalizarJwt(txtToken.getText()).isBlank();
        btnActualizar.setDisable(sinToken || switch (seccion) {
            case VEHICULOS -> consultaVehiculos != null;
            case NOTIFICACIONES -> !sondeo.puedeActualizar();
        });
    }

    private void cambiarSesion(String jwt) {
        cancelarConsultaVehiculos();
        tabla.getItems().clear();
        lblTotal.setText("Total de vehículos: 0");
        mostrarEstado(lblEstado, PresentacionAvisos.Estado.SIN_SESION, jwt.isBlank() ? "Introduce un JWT" : "Listo");
        tablaAvisos.getItems().clear();
        ultimaActualizacion.setText("Sin actualización");
        relojAvisos.stop();
        if (jwt.isBlank()) {
            actualizarEstado(PresentacionAvisos.Estado.SIN_SESION, "JWT ausente. Introduce un token para consultar el historial.");
        } else {
            actualizarEstado(PresentacionAvisos.Estado.CARGA, "Cargando historial…");
            relojAvisos.playFromStart();
        }
        sondeo.cambiarSesion(jwt);
        actualizarBoton();
    }

    private void mostrarAvisos(NotificacionesApiClient.Resultado resultado, Throwable error) {
        var estado = PresentacionAvisos.estado(resultado, error);
        switch (estado) {
            case VACIO, EXITO -> {
                tablaAvisos.getItems().setAll(resultado.avisos());
                ultimaActualizacion.setText("Última actualización · " + PresentacionAvisos.fechaLocal(Instant.now()));
                actualizarEstado(estado, estado == PresentacionAvisos.Estado.VACIO ? "Historial vacío"
                    : "Avisos recuperados: " + resultado.avisos().size());
            }
            case JWT_RECHAZADO, ACCESO_DENEGADO -> {
                relojAvisos.stop();
                tablaAvisos.getItems().clear();
                actualizarEstado(estado, estado == PresentacionAvisos.Estado.JWT_RECHAZADO
                    ? "HTTP 401: JWT inválido o vencido. Introduce uno nuevo."
                    : "HTTP 403: acceso denegado. Se requiere el rol ADMIN.");
            }
            case ERROR -> actualizarEstado(estado, error != null ? "No se pudo consultar el historial. Reintentando…"
                : "Servicio no disponible o respuesta inesperada (HTTP " + resultado.codigoHttp() + "). Reintentando…");
            default -> { }
        }
        actualizarBoton();
    }

    private void actualizarEstado(PresentacionAvisos.Estado estado, String texto) {
        mostrarEstado(estadoAvisos, estado, texto);
    }

    private static Label titulo(String texto, String estilo) {
        Label etiqueta = new Label(texto);
        etiqueta.getStyleClass().add(estilo);
        return etiqueta;
    }

    private void detenerSondeo() {
        relojAvisos.stop();
        sondeo.detener();
    }

    private void cancelarConsultaVehiculos() {
        var pendiente = consultaVehiculos;
        consultaVehiculos = null;
        if (pendiente != null) {
            pendiente.cancel(true);
        }
    }

    @Override
    public void stop() {
        detenerSondeo();
        cancelarConsultaVehiculos();
        txtToken.clear();
    }

    private static String normalizarJwt(String texto) {
        String jwt = texto.trim();
        if (jwt.equalsIgnoreCase("Bearer")) {
            return "";
        }
        return jwt.regionMatches(true, 0, "Bearer ", 0, 7) ? jwt.substring(7).trim() : jwt;
    }

    private void consultarVehiculos() {
        String jwt = normalizarJwt(txtToken.getText());
        if (jwt.isBlank() || consultaVehiculos != null) {
            return;
        }
        mostrarEstado(lblEstado, PresentacionAvisos.Estado.CARGA, "Consultando vehículos…");

        CompletableFuture<VehiculosApiClient.ResultadoConsulta> consulta;
        try {
            consulta = api.consultarVehiculos(jwt);
        } catch (IllegalArgumentException error) {
            mostrarEstado(lblEstado, PresentacionAvisos.Estado.JWT_RECHAZADO, "JWT inválido");
            return;
        }

        consultaVehiculos = consulta;
        actualizarBoton();
        consulta.whenComplete((resultado, error) -> Platform.runLater(() -> {
            if (consultaVehiculos != consulta) {
                return;
            }
            consultaVehiculos = null;
            actualizarBoton();

            if (error != null) {
                mostrarEstado(lblEstado, PresentacionAvisos.Estado.ERROR, "No se pudo conectar con la API de vehículos");
            } else if (resultado.codigoHttp() == 401) {
                mostrarEstado(lblEstado, PresentacionAvisos.Estado.JWT_RECHAZADO, "HTTP 401: JWT inválido o vencido");
            } else if (resultado.codigoHttp() == 403) {
                mostrarEstado(lblEstado, PresentacionAvisos.Estado.ACCESO_DENEGADO, "HTTP 403: acceso denegado");
            } else if (resultado.codigoHttp() == 200) {
                tabla.getItems().setAll(resultado.vehiculos());
                lblTotal.setText("Total de vehículos: " + resultado.vehiculos().size());
                boolean vacio = resultado.vehiculos().isEmpty();
                mostrarEstado(lblEstado, vacio ? PresentacionAvisos.Estado.VACIO : PresentacionAvisos.Estado.EXITO,
                    vacio ? "No hay vehículos registrados" : "Consulta completada");
            } else {
                mostrarEstado(lblEstado, PresentacionAvisos.Estado.ERROR,
                    "Error al consultar vehículos (HTTP " + resultado.codigoHttp() + ")");
            }
        }));
    }

    private static void mostrarEstado(Label etiqueta, PresentacionAvisos.Estado estado, String texto) {
        etiqueta.getStyleClass().removeIf(clase -> clase.startsWith("aviso-"));
        etiqueta.getStyleClass().add("aviso-" + estado.name().toLowerCase(Locale.ROOT).replace('_', '-'));
        etiqueta.setText(texto);
    }

    private <F, T> TableColumn<F, T> agregarColumna(TableView<F> destino, String titulo, Function<F, T> valor, double ancho) {
        TableColumn<F, T> columna = new TableColumn<>(titulo);
        columna.setCellValueFactory(fila -> new ReadOnlyObjectWrapper<>(valor.apply(fila.getValue())));
        columna.setPrefWidth(ancho);
        destino.getColumns().add(columna);
        return columna;
    }
}
