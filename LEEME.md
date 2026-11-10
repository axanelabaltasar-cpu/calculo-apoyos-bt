# Cálculo de Apoyos BT · versión web

La aplicación funciona en la web con Firebase:
- **Hosting:** la página.
- **Authentication:** el acceso, que solo tiene el usuario **tecnicos@elecanto.es**.
- **Firestore:** las bases de apoyos, cables, cables subterráneos y tubos, los precios y los proyectos guardados.

GitHub guarda cada versión con su etiqueta (`v1.34.0`, `v1.35.0`…) y publica la web sola.

## Carpeta

| Archivo | Para qué sirve |
|---|---|
| `web/public/index.html` | La aplicación (la versión se ve arriba a la derecha) |
| `web/firestore.rules` | Reglas: solo tecnicos@elecanto.es lee y escribe |
| `web/.firebaserc` | ID del proyecto de Firebase (lo rellena `subir-a-github.bat`) |
| `.github/workflows/publicar.yml` | Publicación automática al subir a GitHub |
| `subir-a-github.bat` | Enlaza la carpeta con GitHub y sube los cambios |
| `actualizar.bat` | Instala un `apoyos-bt-actualizacion-vX.zip` de Descargas, crea la etiqueta y lo sube |
| `VERSION` | Versión de la carpeta |
| `*.js`, `ui.html`, `build.sh` | Código fuente |

## Puesta en marcha (una sola vez)

### 1. Firebase
1. Entra en https://console.firebase.google.com → **Agregar proyecto** → nombre `calculo-apoyos-bt` → sin Google Analytics → **Crear**. Apunta el **ID del proyecto** (rueda dentada → Configuración del proyecto), por ejemplo `calculo-apoyos-bt-1a2b3`.
2. **Compilación → Authentication → Comenzar → Correo electrónico/contraseña → Habilitar → Guardar.**
3. En **Authentication → Usuarios → Agregar usuario**, crea `tecnicos@elecanto.es` con su contraseña.
4. **Compilación → Firestore Database → Crear base de datos** → ubicación `eur3 (europe)` → **modo de producción** → Crear.
5. **Rueda dentada → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.** Se descarga un archivo `.json`. Guárdalo **fuera** de la carpeta del programa: es una clave privada.
6. En https://console.cloud.google.com/iam-admin/iam (con el mismo proyecto elegido arriba), edita la cuenta `firebase-adminsdk-…@….iam.gserviceaccount.com` → **Agregar otro rol**. Añade:
   - **Administrador de Firebase**
   - **Consumidor de Service Usage**

   Después pulsa **Guardar**.

### 2. GitHub
1. En https://github.com/new crea un repositorio **privado y vacío**: sin README y sin .gitignore. Llámalo `calculo-apoyos-bt`.
2. En el repositorio: **Settings → Secrets and variables → Actions → New repository secret**.
   - Nombre: `FIREBASE_SERVICE_ACCOUNT`.
   - Valor: abre el `.json` del paso 1.5 con el Bloc de notas, copia **todo** y pégalo.

### 3. Tu ordenador
1. Descomprime `calculo-apoyos-bt-v1.34.0.zip` en `C:\`. Queda `C:\calculo-apoyos-bt`.
2. Haz doble clic en `C:\calculo-apoyos-bt\subir-a-github.bat`. La primera vez te pide:
   - el **ID del proyecto de Firebase**;
   - la **dirección del repositorio**, del tipo `https://github.com/usuario/calculo-apoyos-bt`.

   Tiene que terminar con **«LISTO: el programa está guardado en GitHub»**.
3. En GitHub → **Actions → Publicar web**, espera a que salga en verde (1–2 minutos).
4. Abre `https://ID-DEL-PROYECTO.web.app` y entra con `tecnicos@elecanto.es`.
   - La primera vez se cargan solas las bases iniciales: 44 apoyos, 14 cables aéreos, 8 subterráneos y 5 tubos.
   - Debe poner **v1.34.0** arriba a la derecha.
5. Para tenerla como aplicación en Windows, en Chrome o Edge pulsa el icono **Instalar** de la barra de direcciones.

## Actualizaciones
1. Descarga `apoyos-bt-actualizacion-vX.Y.Z.zip` en **Descargas**.
2. Doble clic en `C:\calculo-apoyos-bt\actualizar.bat`.
   - Debe decir «version del paquete: X.Y.Z» y terminar con «LISTO».
   - Guarda la versión en GitHub con su etiqueta `vX.Y.Z`, y GitHub publica la web sola.
3. En la web pulsa **Ctrl+F5** y comprueba la versión.

## Si «Publicar web» sale en rojo
Abre la ejecución en Actions y lee el error:
- **«Falta el secreto FIREBASE_SERVICE_ACCOUNT»**: repite el paso 2.2.
- **«Falta el ID del proyecto»**: ejecuta `subir-a-github.bat`.
- **«Permission denied»** o **«403»**: faltan los dos roles del paso 1.6.

Mientras tanto puedes publicar desde tu ordenador. Necesitas Node.js y `npm i -g firebase-tools`; después:
```
cd C:\calculo-apoyos-bt\web
firebase login
firebase deploy --only hosting,firestore:rules
```

## Datos
- **Contraseña olvidada:** en la pantalla de acceso pulsa «He olvidado la contraseña» y llega un correo a tecnicos@elecanto.es.
- **Copia de las bases:** botón **Exportar bases** (archivo `.json`). Para recuperarlas, usa **Abrir archivo** con ese `.json`.
- **Proyectos:** «Guardar» (o Ctrl+S) los guarda en la base de datos y se abren desde cualquier equipo en «Proyectos guardados», entrando con el usuario. Si quieres además una copia en una carpeta, usa «Exportar a archivo». Los proyectos de la versión de Claude o de la versión local se abren con **Abrir archivo** y, al pulsar «Guardar», pasan a la base de datos.
