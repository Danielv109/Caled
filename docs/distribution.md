# Distribución de escritorio y núcleo Code-OSS

Caled usa una distribución portable de VSCodium para disponer ya del editor completo: archivos, terminal, depurador, Git y extensiones. Integra la IA como extensión incorporada dentro de `resources/app/extensions/caled`. No requiere instalar otra extensión manualmente. El proceso de IA se ejecuta en el extension host; la indexación emplea su worker propio.

Esta entrega **no es todavía un fork recompilado del núcleo ni una reproducción completa de Cursor**. VSCodium se describe como un conjunto de scripts que compilan Code-OSS, no como un fork independiente del editor. Modificar el núcleo sólo cuando una función lo necesite reduce el mantenimiento. La API pública sí permite sugerencias inline, comandos y vistas de diferencias; un renderizado personalizado de cambios dentro de las líneas puede justificar un parche posterior.

## Crear y abrir la aplicación

Requisitos de esta receta: Windows x64 y Node.js 22.14 o posterior. El ZIP fijado ocupa unos 251 MB, además del espacio para extraer el editor. El modelo local se administra aparte; no se descarga ni inicia un modelo durante la preparación del editor.

```powershell
npm install
npm run build
npm run desktop:prepare
npm run desktop:verify
npm run desktop:start
```

También se puede abrir `.runtime/Caled/Caled.cmd`. `npm run desktop:start -- C:\ruta\proyecto` abre otra carpeta. El ejecutable base conserva `VSCodium.exe` y sus recursos originales; `product.json` identifica la interfaz como Caled. Esto evita afirmar que se ha producido un ejecutable con marca y firma propias.

`product/upstream.lock.json` fija VSCodium **1.135.06055**, publicado el 9 de septiembre de 2026, y su SHA-256 obtenido del digest oficial del asset de GitHub. La descarga se verifica antes de extraer. No se resuelve `latest` en cada instalación. El caché está en `.cache/`, el editor en `.runtime/Caled/`, los ajustes y las extensiones del usuario en `.runtime/Caled/data/`.

El perfil portable comienza con Ollama como proveedor, telemetría desactivada y actualizaciones automáticas desactivadas. Los ajustes existentes del usuario nunca se reemplazan. La actualización del binario debe pasar por una actualización revisada del lock y una nueva preparación: una actualización genérica de VSCodium eliminaría la integración. Para cambiar de versión, conserva la carpeta `data` y mueve la distribución anterior fuera de `.runtime/Caled`; prepara la nueva y restaura ese perfil. No se elimina ninguna instalación automáticamente.

`desktop:verify` comprueba estructura, metadatos, privacidad, versión e integración. No sustituye una prueba interactiva de chat, generación o rendimiento. Para renovar sólo la extensión después de compilar, vuelve a ejecutar `desktop:prepare` con Caled cerrado.

## Preparar un fork del código fuente

```powershell
npm run build
npm run source:prepare
```

El comando clona exclusivamente cuando se solicita, en `.upstream/vscode`, y comprueba el commit **08d4889f9ec4a1685d257b9b95de036c8e1ce1e5** de Code-OSS **1.135.0**, registrado por VSCodium para esta distribución. Aplica el producto y copia la extensión incorporada. No cambia de revisión ni descarta modificaciones de un checkout existente.

Antes de compilar el núcleo, usa la versión exacta de Node indicada por `.upstream/vscode/.nvmrc`: **24.18.0** en el commit fijado. Es distinta de la del proyecto de extensión. Se necesita Git, Python compatible con node-gyp y Visual Studio Build Tools con compiladores de C++, SDK de Windows y librerías Spectre. La guía oficial vigente usa **npm**, no `yarn watch`.

Para Windows x64 sin Visual Studio instalado, la [guía oficial de requisitos](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites) especifica este comando en PowerShell elevado:

```powershell
winget install --id Microsoft.VisualStudio.BuildTools -e --source winget --override "--add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre --add Microsoft.VisualStudio.Component.VC.ATL.Spectre --add Microsoft.VisualStudio.Component.VC.ATLMFC.Spectre"
```

Si ya existe Visual Studio, agrega los componentes a la instancia que seleccione node-gyp. Instala Python siguiendo los [requisitos de node-gyp](https://github.com/nodejs/node-gyp#installation), reabre la terminal y comprueba `python --version` y `node --version`. Usa una ruta sin espacios para el checkout. Estos prerrequisitos no se instalan automáticamente al preparar Caled.

```powershell
Set-Location .upstream/vscode
Get-Content .nvmrc
# Instalar/seleccionar primero esa versión de Node.
npm install
npm run watch
# En una segunda terminal, después de Finished compilation:
.\scripts\code.bat
# Para empaquetar una distribución Windows x64:
npm run gulp vscode-win32-x64-min
```

El comando anterior documenta el flujo oficial de Code-OSS; no significa que el núcleo se haya compilado en esta entrega. El overlay simple tampoco replica todos los parches y decisiones de distribución de VSCodium. Antes de publicar un binario recompilado hay que revisar branding completo, iconos, actualización, políticas de privacidad, firma, avisos y pruebas del paquete. No se modifica Monaco sólo para recrear una capacidad existente de la API de extensiones.

El empaquetador del commit fijado descubre `extensions/*/package.json` en `build/lib/extensions.ts`. Caled entrega `dist/extension.js` y `dist/index-worker.js` ya compilados, mantiene `vscode` como import externo proporcionado por el extension host y no necesita compilar otra copia de Monaco. Después de cambiar la extensión, ejecuta nuevamente `source:prepare` desde este proyecto para copiar los bundles antes de compilar Code-OSS. Los únicos cambios iniciales del checkout son el producto, el directorio de la extensión y un marcador local del overlay; no se han modificado archivos de `src/vs/`.

## Próximos hitos verificables

1. Ampliar la prueba real con el modelo local ya preparado a repositorios representativos y evaluar su calidad; se verificaron chat y propuestas en tareas pequeñas, además de la integración mediante mocks.
2. Medir RAM, CPU en reposo y latencia de sugerencias en el mismo proyecto y equipo frente al editor base; no afirmar todavía que Caled es más ligero que Cursor.
3. Validar el build completo de Code-OSS en CI Windows; archivar commit, dependencias, checksum y resultados.
4. Introducir parches pequeños del workbench sólo para capacidades no cubiertas por las APIs públicas, con prueba de rebase en cada actualización.
5. Instalador propio, iconos y firma; Windows ARM64, Linux y macOS necesitan recetas y pruebas adicionales.

## Licencias y fuentes

Se conservan las licencias y avisos incluidos en el ZIP original. Code-OSS y VSCodium se publican bajo MIT; los componentes incluidos conservan sus propios avisos. La licencia del binario oficial de Microsoft y las condiciones de algunas extensiones son diferentes. Caled usa Open VSX para la galería heredada, sin sustituirla por Visual Studio Marketplace.

- [VSCodium: qué distribuye, licencias y extensiones](https://github.com/VSCodium/vscodium/blob/master/README.md).
- [Release VSCodium fijada](https://github.com/VSCodium/vscodium/releases/tag/1.135.06055).
- [Digest oficial de los assets](https://api.github.com/repos/VSCodium/vscodium/releases/tags/1.135.06055).
- [Revisión Code-OSS empleada por esa release](https://raw.githubusercontent.com/VSCodium/vscodium/1.135.06055/upstream/stable.json).
- [Compilación oficial de Code-OSS](https://github.com/microsoft/vscode/wiki/How-to-Contribute).
- [Licencia Code-OSS](https://github.com/microsoft/vscode/blob/main/LICENSE.txt).
- [Modo portable](https://code.visualstudio.com/docs/setup/portable).
