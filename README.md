# Oldelval · Archivo Audiovisual

Sitio web interno de archivo audiovisual para **Oleoductos del Valle (Oldelval)**, desarrollado por **Tronadores**. Desplegado en [oldelval-archivo.vercel.app](https://oldelval-archivo.vercel.app).

---

## 🛠️ Guía de Configuración y Renovación de Tokens

Tanto Dropbox como Vimeo requieren credenciales de acceso para que el scraper diario (GitHub Actions) y la interfaz de usuario de la web puedan cargar y listar el material audiovisual.

A continuación se detalla cómo configurar de manera definitiva las credenciales para evitar expiraciones automáticas.

---

### 1. Integración con Dropbox (Refresh Token de larga duración)

Dropbox **ya no permite** crear tokens estáticos que duren para siempre (ahora expiran en 4 horas). La solución definitiva implementada es el uso de un **Refresh Token** de OAuth2, el cual permite generar automáticamente nuevos tokens temporales en segundo plano.

#### Paso 1.1: Obtener App Key y App Secret
1. Ve a la consola de desarrolladores de Dropbox: [Dropbox Developers App Console](https://www.dropbox.com/developers/apps).
2. Si no tienes una app creada, crea una nueva seleccionando **Scoped Access** y tipo de acceso **Full Dropbox** o **App Folder** (según dónde estén los archivos).
3. En la pestaña **Settings**, copia el **App key** y el **App secret**.

#### Paso 1.2: Configurar Permisos (Scopes)
En la pestaña **Permissions** de tu app, asegúrate de activar al menos:
- `files.metadata.read` (para listar carpetas y archivos)
- `sharing.write` y `sharing.read` (para crear y leer enlaces públicos compartidos)
- *Nota:* Si usas una cuenta Business y necesitas el parámetro `DROPBOX_TEAM_MEMBER_ID`, activa también `team_data.member` en los permisos de equipo.
*¡Haz clic en **Submit** o **Save** al final de la página de permisos!*

#### Paso 1.3: Obtener el Código de Autorización Inicial
Abre la siguiente URL en tu navegador reemplazando `TU_APP_KEY` por tu valor real:
```text
https://www.dropbox.com/oauth2/authorize?client_id=TU_APP_KEY&response_type=code&token_access_type=offline
```
1. Haz clic en **Continuar** y **Permitir** para dar acceso.
2. Copia el **código de autorización** que se muestra en pantalla.

#### Paso 1.4: Generar el Refresh Token Definitivo
Abre la terminal de tu sistema y ejecuta el siguiente comando reemplazando los placeholders con tus valores reales (en Windows puedes usar PowerShell o CMD):

```bash
curl https://api.dropboxapi.com/oauth2/token \
  -d grant_type=authorization_code \
  -d code=CODIGO_DE_AUTORIZACION \
  -d client_id=TU_APP_KEY \
  -d client_secret=TU_APP_SECRET
```

En la respuesta en formato JSON, verás una propiedad llamada `"refresh_token"`. **Copia y guarda este valor de forma segura.** Nunca expira a menos que lo desvincules manualmente.

---

### 2. Integración con Vimeo (Personal Access Token)

Los tokens de Vimeo no expiran de forma predeterminada, pero si el actual ha dejado de funcionar o ha sido revocado, puedes generar uno nuevo fácilmente:

1. Ve a la consola de desarrolladores de Vimeo: [Vimeo Developer Applications](https://developer.vimeo.com/apps).
2. Crea una App si no tienes una.
3. Dentro de la App, ve a la sección **Generate an Access Token**.
4. Selecciona acceso **Authenticated (you)**.
5. Elige los scopes: `public` y `private`.
6. Haz clic en **Generate**.
7. Copia el token generado (`VIMEO_TOKEN`).

---

## 🔑 Variables de Entorno (Dónde configurarlas)

Para que el proyecto funcione en producción y durante el scrape automático, debes configurar las siguientes variables de entorno en dos plataformas:

### A) En el Panel de Vercel (Producción)
Ve a **Vercel** → **Tu Proyecto (oldelval-archivo)** → **Settings** → **Environment Variables** y configura las siguientes claves:

| Variable | Descripción | Valor |
|---|---|---|
| `DROPBOX_REFRESH_TOKEN` | Token de refresco obtenido en el Paso 1.4 | `db1a...` |
| `DROPBOX_APP_KEY` | App Key de tu aplicación de Dropbox | `abc123xyz...` |
| `DROPBOX_APP_SECRET` | App Secret de tu aplicación de Dropbox | `987654...` |
| `VIMEO_TOKEN` | Token de acceso de Vimeo | `vimeo_token_aqui...` |
| `DROPBOX_TEAM_MEMBER_ID` | (Opcional) ID de miembro para cuentas corporativas Business | `dbmid:AA...` |

*¡No olvides redesplegar en Vercel para que los cambios surtan efecto!*

---

### B) En los Secretos de GitHub (GitHub Actions - Scraper Diario)
El script de actualización que corre cada mañana necesita acceso a estas variables para poder escribir el archivo `data.json`.
Ve a tu repositorio de **GitHub** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** y crea los siguientes secretos:

- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `VIMEO_TOKEN`
- `DROPBOX_ROOT_PATH` (Ejemplo: `/OLDELVAL`)
- `DROPBOX_TEAM_MEMBER_ID` (Opcional)

---

## 🚀 Desarrollo y Pruebas Locales

Si deseas probar el script localmente antes de subirlo:

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Configura temporalmente tus credenciales en tu entorno local y ejecuta:
   ```bash
   # En Windows (PowerShell)
   $env:DROPBOX_REFRESH_TOKEN="TU_REFRESH_TOKEN"
   $env:DROPBOX_APP_KEY="TU_APP_KEY"
   $env:DROPBOX_APP_SECRET="TU_APP_SECRET"
   $env:VIMEO_TOKEN="TU_VIMEO_TOKEN"
   node scripts/generate-data.js
   ```
   Esto refrescará `data.json` localmente para verificar que la conexión es exitosa.
