export function crearSesion(ahora = Date.now) {
  let token = null;
  let venceEn = 0;

  function cerrar() {
    token = null;
    venceEn = 0;
  }

  return {
    guardar(jwt, segundos) {
      token = jwt;
      venceEn = ahora() + segundos * 1000;
    },
    leer() {
      if (ahora() >= venceEn) cerrar();
      return token;
    },
    cerrar,
  };
}
