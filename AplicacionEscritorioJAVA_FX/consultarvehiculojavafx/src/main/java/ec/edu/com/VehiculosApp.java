package ec.edu.com;

import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.beans.property.ReadOnlyObjectWrapper;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.stage.Stage;
import javafx.util.Duration;

import java.net.http.HttpClient;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;

public final class VehiculosApp extends Application {
    private final HttpClient transporte = VehiculosApiClient.nuevoTransporte();
    private final VehiculosApiClient api = new VehiculosApiClient(transporte);
    private final NotificacionesApiClient apiNotificaciones = new NotificacionesApiClient(transporte);
    private final PasswordField txtToken = new PasswordField();
    private final Button btnConsultar = new Button("Consultar");
    private final Label lblEstado = new Label("Listo");
    private final Label lblTotal = new Label("Total de vehículos: 0");
    private final TableView<Vehiculo> tabla = new TableView<>();
    private final TableView<AvisoVenta> tablaAvisos = new TableView<>();
    private final Label estadoAvisos = new Label("Introduce un JWT para consultar el historial");
    private final SondeoNotificaciones sondeo = new SondeoNotificaciones(
        apiNotificaciones::consultar, Platform::runLater, this::mostrarAvisos);
    private final Timeline relojAvisos = new Timeline(
        new KeyFrame(Duration.seconds(4), evento -> sondeo.actualizar()));
    private CompletableFuture<VehiculosApiClient.ResultadoConsulta> consultaVehiculos;

    @Override
    public void start(Stage ventana) {
        txtToken.setPromptText("Pega el JWT");
        txtToken.setMaxWidth(Double.MAX_VALUE);
        txtToken.textProperty().addListener((observable, anterior, nuevo) -> {
            if (!normalizarJwt(anterior).equals(normalizarJwt(nuevo))) {
                cambiarSesion(normalizarJwt(nuevo));
            }
        });

        Button cerrarSesion = new Button("Cerrar sesión");
        cerrarSesion.disableProperty().bind(txtToken.textProperty().isEmpty());
        cerrarSesion.setOnAction(evento -> txtToken.clear());
        HBox sesion = new HBox(12, txtToken, cerrarSesion);
        HBox.setHgrow(txtToken, Priority.ALWAYS);

        Tab vehiculos = new Tab("Vehículos", crearVistaVehiculos());
        Tab avisos = new Tab("Notificaciones", crearVistaAvisos());
        TabPane secciones = new TabPane(vehiculos, avisos);
        secciones.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        avisos.setOnSelectionChanged(evento -> {
            if (avisos.isSelected()) {
                sondeo.actualizar();
            }
        });
        relojAvisos.setCycleCount(Timeline.INDEFINITE);
        VBox.setVgrow(secciones, Priority.ALWAYS);
        VBox contenido = new VBox(12, new Label("JWT del usuario"), sesion, secciones);
        contenido.setPadding(new Insets(22));
        contenido.setStyle("-fx-background-color: green");
        ventana.setScene(new Scene(contenido, 1024, 650));
        ventana.setTitle("Consulta Vehículos");
        ventana.show();
    }

    private VBox crearVistaVehiculos() {
        btnConsultar.setMaxWidth(130);
        btnConsultar.setOnAction(evento -> consultarVehiculos());
        HBox acciones = new HBox(14, btnConsultar, lblEstado);
        acciones.setAlignment(Pos.CENTER_LEFT);
        lblEstado.setWrapText(true);

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
        return new VBox(12, new Label("Vehículos registrados"), acciones, tabla, lblTotal);
    }

    private VBox crearVistaAvisos() {
        agregarColumna(tablaAvisos, "ID de venta", AvisoVenta::ventaId, 100);
        agregarColumna(tablaAvisos, "Estado", AvisoVenta::estado, 135);
        agregarColumna(tablaAvisos, "Fecha y hora (UTC)", AvisoVenta::fechaUTC, 250);
        agregarColumna(tablaAvisos, "Identificador del evento", AvisoVenta::eventoId, 325);
        tablaAvisos.getColumns().forEach(columna -> columna.setSortable(false));
        tablaAvisos.setPlaceholder(new Label("Sin avisos para mostrar"));
        estadoAvisos.setWrapText(true);
        VBox.setVgrow(tablaAvisos, Priority.ALWAYS);
        return new VBox(12, estadoAvisos, tablaAvisos);
    }

    private void cambiarSesion(String jwt) {
        cancelarConsultaVehiculos();
        tabla.getItems().clear();
        lblTotal.setText("Total de vehículos: 0");
        mostrarEstado("Listo", false);
        tablaAvisos.getItems().clear();
        relojAvisos.stop();
        if (jwt.isBlank()) {
            estadoAvisos.setText("JWT ausente. Introduce un token para consultar el historial.");
        } else {
            estadoAvisos.setText("Consultando historial…");
            relojAvisos.playFromStart();
        }
        sondeo.cambiarSesion(jwt);
    }

    private void mostrarAvisos(NotificacionesApiClient.Resultado resultado, Throwable error) {
        if (error != null) {
            estadoAvisos.setText("Servicio no disponible o respuesta inválida. Se volverá a intentar.");
            return;
        }
        switch (resultado.codigoHttp()) {
            case 200 -> {
                tablaAvisos.getItems().setAll(resultado.avisos());
                estadoAvisos.setText(resultado.avisos().isEmpty() ? "Historial vacío"
                    : "Avisos recuperados: " + resultado.avisos().size());
            }
            case 401, 403 -> {
                detenerSondeo();
                tablaAvisos.getItems().clear();
                estadoAvisos.setText(resultado.codigoHttp() == 401
                    ? "HTTP 401: JWT ausente, inválido o vencido. Introduce un token nuevo."
                    : "HTTP 403: acceso denegado. Se requiere el rol ADMIN.");
            }
            default -> estadoAvisos.setText("Servicio no disponible o respuesta inesperada (HTTP "
                + resultado.codigoHttp() + "). Se volverá a intentar.");
        }
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
        btnConsultar.setDisable(false);
    }

    @Override
    public void stop() {
        detenerSondeo();
        cancelarConsultaVehiculos();
        txtToken.clear();
    }

    private static String normalizarJwt(String texto) {
        String jwt = texto.trim();
        return jwt.regionMatches(true, 0, "Bearer ", 0, 7) ? jwt.substring(7).trim() : jwt;
    }

    private void consultarVehiculos() {
        btnConsultar.setDisable(true);
        mostrarEstado("Consultando vehículos…", false);

        CompletableFuture<VehiculosApiClient.ResultadoConsulta> consulta;
        try {
            consulta = api.consultarVehiculos(normalizarJwt(txtToken.getText()));
        } catch (IllegalArgumentException error) {
            btnConsultar.setDisable(false);
            mostrarEstado("JWT inválido", true);
            return;
        }

        consultaVehiculos = consulta;
        consulta.whenComplete((resultado, error) -> Platform.runLater(() -> {
            if (consultaVehiculos != consulta) {
                return;
            }
            consultaVehiculos = null;
            btnConsultar.setDisable(false);

            if (error != null) {
                mostrarEstado("No se pudo conectar con la API de vehículos", true);
            } else if (resultado.codigoHttp() == 401) {
                mostrarEstado("HTTP 401: JWT inválido o vencido", true);
            } else if (resultado.codigoHttp() == 403) {
                mostrarEstado("HTTP 403: acceso denegado", true);
            } else if (resultado.codigoHttp() == 200) {
                tabla.getItems().setAll(resultado.vehiculos());
                lblTotal.setText("Total de vehículos: " + resultado.vehiculos().size());
                mostrarEstado("Consulta completada", false);
            } else {
                mostrarEstado("Error al consultar vehículos (HTTP " + resultado.codigoHttp() + ")", true);
            }
        }));
    }

    private void mostrarEstado(String texto, boolean error) {
        lblEstado.setText(texto);
        lblEstado.setTextFill(error ? Color.RED : Color.BLUE);
    }

    private <F, T> void agregarColumna(TableView<F> destino, String titulo, Function<F, T> valor, double ancho) {
        TableColumn<F, T> columna = new TableColumn<>(titulo);
        columna.setCellValueFactory(fila -> new ReadOnlyObjectWrapper<>(valor.apply(fila.getValue())));
        columna.setPrefWidth(ancho);
        destino.getColumns().add(columna);
    }
}
