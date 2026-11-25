package ec.edu.uta.venta_vehiculos_api.controller;

// Importa el DTO que representa la respuesta
// que se devolverá cuando el token sea generado correctamente.
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ec.edu.uta.venta_vehiculos_api.dto.TokenResponse;
import ec.edu.uta.venta_vehiculos_api.security.JwtService;

import ec.edu.uta.venta_vehiculos_api.model.Rol;
import ec.edu.uta.venta_vehiculos_api.service.UsuarioApiService;


// Indica que esta clase es un controlador REST.
//
// Spring detectará esta clase
// y permitirá que atienda peticiones HTTP.
@RestController


// Define la ruta base del controlador.
//
// Todos los endpoints de esta clase
// comenzarán con:
//
// /oauth
@RequestMapping("/oauth")
public class AuthController {


    // Dependencia que utilizaremos para generar los JWT.
    //
    // final significa que una vez asignada
    // no debería cambiar durante la vida del objeto.
    private final JwtService jwtService;


    // Lee desde application.properties:
    //
    // Credenciales de ejemplo omitidas; utilizar configuracion privada.
    //
    // Representa el identificador esperado
    // de la aplicación cliente.
    @Value("${app.security.client-id}")
    private String clientId;


    // Lee desde application.properties:
    //
    // Credenciales de ejemplo omitidas; utilizar configuracion privada.
    //
    // Representa la contraseña o secreto
    // de la aplicación cliente.
    @Value("${app.security.client-secret}")
    private String clientSecret;

    @Value("${app.security.pwa-client-id}")
    private String pwaClientId;

    @Value("${app.security.pwa-client-secret}")
    private String pwaClientSecret;

    private enum Cliente {
        ORDINARIO, PWA, NO_AUTORIZADO
    }

    // Constructor de AuthController.
    //
    // Spring utiliza este constructor
    // para inyectar automáticamente JwtService.
    public AuthController(JwtService jwtService, UsuarioApiService usuarioApiService) {

        // Guarda el servicio recibido
        // dentro del atributo de la clase.
        this.jwtService = jwtService;
        this.usuarioApiService = usuarioApiService;
    }
    private final UsuarioApiService usuarioApiService;

    private Cliente autenticarCliente(String authorization) {
        try {
            return clienteValido(authorization);
        } catch (IllegalArgumentException ex) {
            // Basic mal formado.
            return Cliente.NO_AUTORIZADO;
        }
    }



    // Indica que este método responderá
    // a peticiones HTTP POST.
    //
    // Como la clase tiene:
    //
    // @RequestMapping("/oauth")
    //
    // y este método:
    //
    // @PostMapping("/token")
    //
    // la ruta completa será:
    //
    // POST /oauth/token
    @PostMapping("/token")


    // Método encargado de recibir la solicitud
    // para generar un token.
    //
    // ResponseEntity<?> indica que puede devolver
    // diferentes tipos de respuesta:
    //
    // TokenResponse si todo funciona.
    //
    // Map con un mensaje de error
    // si ocurre una validación incorrecta.
    public ResponseEntity<?> token(


            // Lee el encabezado HTTP Authorization.
            //
            // Ejemplo recibido:
            //
            // Credenciales de ejemplo omitidas; utilizar configuracion privada.
            //
            // required = false significa que
            // Spring permite que el encabezado no exista.
            @RequestHeader(
                    value = HttpHeaders.AUTHORIZATION,
                    required = false
            )
            String authorization,


            // Recibe el parámetro:
            //
            // grant_type
            //
            // En Postman se enviará normalmente
            // mediante x-www-form-urlencoded.
            @RequestParam("grant_type")
            String grantType,


            // Recibe el username del usuario.
            //
            // Ejemplo:
            //
            // Credenciales de ejemplo omitidas; utilizar configuracion privada.
            @RequestParam("username")
            String username,


            // Recibe la contraseña del usuario.
            //
            // Ejemplo:
            //
            // Credenciales de ejemplo omitidas; utilizar configuracion privada.
            @RequestParam("password")
            String password,


            // Recibe el identificador de la aplicación.
            //
            // required = false significa que es opcional.
            //
            // Si no llega, posteriormente
            // se utilizará el valor "92".
            @RequestParam(
                    value = "idapli",
                    required = false
            )
            String idapli) {


        // PRIMERA VALIDACIÓN:
        // comprobar las credenciales de la aplicación cliente.
        //
        Cliente cliente = autenticarCliente(authorization);
        if (cliente == Cliente.NO_AUTORIZADO) {


            // Construimos una respuesta HTTP de error.
            return ResponseEntity


                    // Devuelve:
                    //
                    // HTTP 401 Unauthorized
                    //
                    // Significa que las credenciales
                    // del cliente no fueron aceptadas.
                    .status(HttpStatus.UNAUTHORIZED)


                    // Construye el cuerpo de la respuesta.
                    //
                    // Map.of() se convertirá automáticamente a JSON.
                    .body(Map.of(


                            // Campo JSON:
                            //
                            // "success": false
                            "success", false,


                            // Campo JSON:
                            //
                            // "mensaje": "Cliente no autorizado"
                            "mensaje", "Cliente no autorizado"
                    ));
        }


        // SEGUNDA VALIDACIÓN:
        // comprobar el grant_type recibido.
        //
        // Para este ejemplo didáctico
        // solamente aceptamos:
        //
        // grant_type=password
        if (!"password".equals(grantType)) {


            // Si se envió otro grant_type,
            // devolvemos una respuesta de error.
            return ResponseEntity


                    // HTTP 400 Bad Request.
                    //
                    // La petición llegó correctamente,
                    // pero contiene un valor que no soportamos.
                    .status(HttpStatus.BAD_REQUEST)


                    // Construimos el JSON de respuesta.
                    .body(Map.of(

                            // Indica que la operación falló.
                            "success", false,

                            // Explica la causa.
                            "mensaje", "grant_type no soportado"
                    ));
        }


        // TERCERA VALIDACIÓN:
        // comprobar username y password del usuario.
        //
        // No debe confundirse con las credenciales
        // del cliente enviadas mediante Basic Auth.
        
        Rol perfil;
        try {

        perfil =
                usuarioApiService.autenticar(
                        username,
                        password
                );

        } catch (IllegalArgumentException e) {

        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(Map.of(
                        "success", false,
                        "mensaje",
                        "Usuario o contraseña incorrectos"
                ));
        }

        // Si llegamos hasta aquí significa que:
        //
        // 1. El cliente es válido.
        // 2. grant_type es correcto.
        // 3. username y password son correctos.


        String scopeBase = "vehiculos";
        String rol = perfil.getRolBase();
        String scope = scopeBase;
        if (cliente == Cliente.PWA && ("OPERADOR".equals(rol) || "ADMIN".equals(rol))) {
            scope += " " + JwtService.PERMISO_CREAR_VENTA;
        }


        // Operador ternario:
        //
        // condición ? valor_si_verdadero : valor_si_falso
        //
        // Si idapli es null:
        //
        // usa "92"
        //
        // Si idapli tiene un valor:
        //
        // utiliza el valor recibido.
        String idAplicacion =
                idapli == null ? "92" : idapli;


        // Solicita a JwtService
        // la generación del ACCESS TOKEN.
        String accessToken =
                jwtService.generarAccessToken(

                        // Usuario autenticado.
                        username,

                        // Identificador de aplicación.
                        idAplicacion,

                        // Permiso que tendrá el token.
                        scope,
                        rol,
                        perfil.getNombre()
                );


        // Solicita a JwtService
        // la generación del REFRESH TOKEN.
        String refreshToken =
                jwtService.generarRefreshToken(

                        // Usuario.
                        username,

                        // Identificador de aplicación.
                        idAplicacion,

                        // El permiso de venta pertenece al access token.
                        scopeBase,
                        rol,
                        perfil.getNombre()
                );


        // Construye el objeto que será enviado
        // como respuesta al cliente.
        //
        // TokenResponse es un DTO.
        TokenResponse respuesta =
                new TokenResponse(


                        // Primer campo:
                        // access_token
                        accessToken,


                        // Segundo campo:
                        // token_type
                        //
                        // Indica que el token deberá enviarse
                        // posteriormente como Bearer Token.
                        "bearer",


                        // Tercer campo:
                        // refresh_token
                        refreshToken,


                        // Cuarto campo:
                        // expires_in
                        //
                        // JwtService convierte los minutos
                        // configurados a segundos.
                        jwtService
                                .getAccessTokenExpiresInSeconds(),


                        // Quinto campo:
                        // scope
                        scope
                );


        // Devuelve:
        //
        // HTTP 200 OK
        //
        // junto con el objeto TokenResponse.
        //
        // Spring/Jackson convertirá automáticamente
        // este objeto a JSON.
        return ResponseEntity.ok(respuesta);
    }


    // Método privado que verifica
    // las credenciales de la aplicación cliente.
    //
    // Recibe el encabezado Authorization completo.
    private Cliente clienteValido(
            String authorization) {


        // Comprueba dos cosas:
        //
        // 1. Que Authorization exista.
        // 2. Que comience exactamente con "Basic ".
        if (authorization == null ||
                !authorization.startsWith("Basic ")) {


            // Si cualquiera de las condiciones falla,
            // el cliente no es válido.
            return Cliente.NO_AUTORIZADO;
        }


        // Ejemplo:
        //
        // Authorization:
        // Credenciales de ejemplo omitidas; utilizar configuracion privada.
        //
        // substring(6) elimina:
        //
        // "Basic "
        //
        // porque tiene 6 caracteres.
        //
        // Conservamos únicamente el texto Base64.
        String base64 =
                authorization.substring(6);


        // Decodificamos el texto Base64.
        //
        // El resultado debería tener esta forma:
        //
        // Credenciales de ejemplo omitidas; utilizar configuracion privada.
        String credenciales =
                new String(


                        // Convierte el Base64
                        // nuevamente a bytes.
                        Base64
                                .getDecoder()
                                .decode(base64),


                        // Interpreta esos bytes
                        // utilizando UTF-8.
                        StandardCharsets.UTF_8
                );


        // Divide la cadena utilizando ":"
        // como separador.
        //
        // Ejemplo:
        //
        // Credenciales de ejemplo omitidas; utilizar configuracion privada.
        //
        // produce:
        //
        // Credenciales de ejemplo omitidas; utilizar configuracion privada.
        // Credenciales de ejemplo omitidas; utilizar configuracion privada.
        //
        // El número 2 indica que como máximo
        // se crearán dos partes.
        String[] partes =
                credenciales.split(":", 2);


        // Verifica que realmente
        // existan las dos partes esperadas:
        //
        // usuario y contraseña.
        if (partes.length != 2) {


            // Si no existen dos partes,
            // el formato de las credenciales es incorrecto.
            return Cliente.NO_AUTORIZADO;
        }


        // Obtiene la primera parte.
        //
        // Representa el identificador
        // de la aplicación cliente.
        String usuarioCliente =
                partes[0];


        // Obtiene la segunda parte.
        //
        // Representa el secreto
        // de la aplicación cliente.
        String claveCliente =
                partes[1];


        // Finalmente verifica que:
        //
        // usuarioCliente sea igual al clientId configurado
        //
        // Y
        //
        // claveCliente sea igual al clientSecret configurado.
        //
        // Ambas condiciones deben cumplirse.
        if (clientId.equals(usuarioCliente) && mismoSecreto(clientSecret, claveCliente)) {
            return Cliente.ORDINARIO;
        }
        if (!pwaClientId.isBlank() && !pwaClientSecret.isBlank()
                && !clientId.equals(pwaClientId) && !mismoSecreto(clientSecret, pwaClientSecret)
                && pwaClientId.equals(usuarioCliente) && mismoSecreto(pwaClientSecret, claveCliente)) {
            return Cliente.PWA;
        }
        return Cliente.NO_AUTORIZADO;
    }

    private static boolean mismoSecreto(String esperado, String recibido) {
        return MessageDigest.isEqual(esperado.getBytes(StandardCharsets.UTF_8),
                recibido.getBytes(StandardCharsets.UTF_8));
    }


    // Método privado utilizado para validar
    // las credenciales del USUARIO.
    //
    // Atención:
    // estas NO son las credenciales
    // Basic Auth del cliente.
    
}
