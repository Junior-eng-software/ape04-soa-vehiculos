# Cliente web React

Requiere Node.js 24 y NGINX. Instala las dependencias declaradas con `npm ci`.

## Arranque para la defensa

Carga las dos variables del cliente OAuth ordinario en la misma terminal que inicia Vite. El proceso de Vite usa las variables `REACT_OAUTH_CLIENT_ID` y `REACT_OAUTH_CLIENT_SECRET` para autenticar el proxy de login. Define `REACT_GATEWAY_URL` si debes usar un NGINX de ensayo distinto del local en 8090.

```powershell
. 'C:\ensayo\cargar_cliente.ps1'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Abre `http://127.0.0.1:5174/` e inicia sesión con tu usuario y contraseña. La sesión muestra el usuario y el rol, y permite consultar el dashboard, el catálogo o las ventas. **Cerrar sesión** limpia los resultados de la sesión.

## Compilación y pruebas

```powershell
node --test tests/*.test.js
npm run build
```

`dist` contiene los archivos estáticos. El endpoint `/auth/login` existe en el servidor de desarrollo de Vite. Para la defensa usa el arranque anterior.