# Caled

Editor de escritorio basado en Code OSS/VSCodium, con IA local por defecto y proveedores externos opcionales. Proyecto MIT, sin suscripción de Caled.

**Estado: versión 0.1 funcional, no paridad completa con Cursor.** Incluye una distribución Windows x64 preparada, IA incorporada y un checkout del núcleo listo para continuar el desarrollo. No se ha compilado un ejecutable propio desde el núcleo ni demostrado menor consumo que Cursor. El detalle de avances y pendientes está en [ROADMAP](docs/ROADMAP.md).

## Abrir la aplicación

En esta carpeta, abre **`Abrir-Caled.cmd`** o ejecuta:

```powershell
npm run desktop:start
```

El icono de Caled en la barra lateral abre el asistente. Atajos: **Ctrl+Alt+L** para chat, **Ctrl+Alt+K** para proponer una edición, **Tab** para aceptar autocompletado y **Escape** para descartarlo.

La distribución se encuentra en `.runtime/Caled`. Conserva el ejecutable original `VSCodium.exe`; la interfaz y el perfil portable pertenecen a Caled. No reemplaza tu instalación de VS Code.

## IA local gratis, ya preparada en este equipo

Se preparó **Ollama 0.34.3 en modo CPU** dentro de `.runtime/ollama`, con nube desactivada, y se descargó **Qwen2.5-Coder 1.5B** (~986 MB) en `.runtime/models`. El perfil portable ya lo tiene seleccionado. `Abrir-Caled.cmd` y `npm run desktop:start` arrancan el servidor local cuando hace falta.

Se eligió 1.5B porque este equipo tenía sólo unos 2,8 GB de RAM libre durante la preparación. Se verificaron generación de código y propuestas reales. Es un modelo pequeño: no esperes el nivel de Kimi/DeepSeek de servidor y revisa siempre los cambios.

Para reproducir esta preparación en Windows x64:

```powershell
npm run desktop:prepare
npm run ai:prepare
npm run desktop:start
```

La descarga oficial inicial de Ollama ocupa 1,46 GB, pero sólo se extraen los componentes CPU necesarios (~70 MB), conservando sus avisos de licencia. `npm run ai:unload` libera la memoria del modelo; el servidor también lo descarga tras dos minutos sin uso. No se instaló un servicio de Windows ni se cambió el PATH global.

### Usar una instalación propia o un modelo mayor

1. Instala [Ollama para Windows](https://ollama.com/download/windows).
2. Descarga un modelo de código:

   ```powershell
   ollama pull qwen2.5-coder:3b
   ```

3. Comprueba que Ollama esté iniciado. Si necesitas arrancarlo desde una terminal: `ollama serve`.
4. En Caled ejecuta **Caled: Elegir modelo disponible** desde Ctrl+Shift+P y selecciona el modelo instalado.

El modelo inicial ocupa aproximadamente 1,9 GB y se eligió como opción moderada para un equipo con 16 GB de RAM. No se presenta como el modelo más reciente ni como equivalente a modelos de servidor. Puedes seleccionar modelos nuevos sin cambiar el código: el listado se consulta al proveedor. [Catálogo oficial](https://ollama.com/library/qwen2.5-coder/tags).

La IA local consume RAM, almacenamiento y energía, aunque no tenga cuota por token. El runtime administrado desactiva las funciones de nube con `OLLAMA_NO_CLOUD=1`; si usas otra instalación de Ollama, revisa su configuración. Evita modelos con sufijo `cloud` si buscas ejecución exclusivamente local.

Puedes comprobar tu entorno con `npm run doctor`. Para descargar otro modelo mediante el runtime incluido, ejecuta `npm run ai:prepare -- qwen2.5-coder:3b` y después selecciónalo en Caled. El comando conserva tu selección actual si ya existe.

## Kimi, DeepSeek y otros servidores

Ejecuta **Caled: Configurar proveedor y modelo**. Se admiten Ollama, DeepSeek, Kimi/Moonshot y servidores compatibles con `/v1/chat/completions`, como LM Studio y llama.cpp. Los identificadores de modelo son configurables y se pueden descubrir mediante la API.

Las APIs externas pueden cobrar por uso y reciben los fragmentos de código enviados. No dependen de una suscripción a Caled. Las claves se guardan con `SecretStorage`, vinculadas al proveedor y a su endpoint; nunca se escriben en `settings.json`. **Caled: Eliminar clave API** borra la clave del endpoint actual. Detalles y fuentes en [proveedores](docs/providers.md).

## Funciones de esta versión

- Editor completo heredado de VSCodium: explorador, terminal, Git, depurador y extensiones de Open VSX.
- Chat con streaming y cancelación; contexto del archivo activo, selección y proyecto.
- Autocompletado inline con debounce, cancelación y caché de la última sugerencia.
- Composer propone reemplazos o archivos nuevos en hasta 12 archivos; revisión con el diff nativo y aplicación explícita. Los cambios quedan en el editor para guardar y deshacer.
- Rechazo de propuestas obsoletas, texto ambiguo, rutas externas, enlaces simbólicos y archivos excluidos.
- Índice en worker separado, persistencia SQLite cuando el runtime la permite, búsqueda léxica y reranking semántico local opcional.
- Contexto limitado y exclusiones de `.gitignore`, `.caledignore`, dependencias, binarios y patrones comunes de secretos.
- Espacios de trabajo sin confianza no envían solicitudes ni indexan archivos.

Los modelos pueden producir resultados incorrectos. Composer exige fragmentos exactos y únicos; si un modelo pequeño devuelve JSON inválido o contenido no coincidente, la propuesta se rechaza conservando los archivos.

## Contexto y privacidad

La búsqueda básica no descarga modelos y funciona sin red. Divide archivos de texto de hasta 128 KiB en fragmentos de líneas; no es todavía un parser por funciones/clases. Predeterminados: 2.500 archivos, 24 MiB de contenido y 18.000 caracteres de contexto. El límite incluye el archivo activo; la conversación se acota aparte. El índice se guarda en el almacenamiento local de la extensión y contiene fragmentos de código sin cifrar.

Para activar reranking opcional:

```powershell
ollama pull nomic-embed-text
```

Después activa `caled.context.semantic`. Los candidatos léxicos se reordenan con embeddings de Ollama en `127.0.0.1:11434`; si no está disponible, se conserva la búsqueda léxica. No es una búsqueda vectorial completa sobre todos los archivos.

Esta versión trabaja con la **primera carpeta** de un workspace. La indexación comienza al abrir el panel o enviar una solicitud y se actualiza tras guardar, crear o borrar archivos; también hay un botón de actualización manual. El historial de conversación no se recupera entre reinicios del host. Los patrones de exclusión no sustituyen una revisión de secretos incrustados dentro de código fuente.

## Desarrollo y validación

Requisitos de la extensión: Node.js 22.14 o posterior y npm.

```powershell
npm ci
npm run check
npm run desktop:prepare
npm run test:desktop
npm run test:live
npm run test:desktop -- --live
npm run package:extension
```

`test:desktop` abre una instancia temporal del editor con un proyecto aislado y una API simulada en loopback; comprueba la integración sin consumir una API de pago. `test:live` y `test:desktop -- --live` usan el modelo local real. Los registros quedan en `artifacts/`. Las pruebas unitarias cubren protocolos, UI, exclusiones, SQLite, embeddings simulados y propuestas. Estos casos pequeños no son una evaluación exhaustiva de calidad.

Para desarrollar con F5 usa la configuración incluida en `.vscode/launch.json`. Para preparar el núcleo: `npm run source:prepare`. La compilación completa requiere **Node 24.18.0**, Python y Visual Studio Build Tools, según el commit fijado. Instrucciones, licencia y actualización en [distribución](docs/distribution.md).

El VSIX permite usar el asistente en una instalación independiente de VS Code/VSCodium. Dentro de Caled ya viene incorporado: actualízalo con `desktop:prepare`, porque el editor impide reemplazar extensiones integradas mediante un VSIX en calidad estable. Evidencia de pruebas y limitaciones en [validación](docs/VALIDATION.md).

## Estructura

| Ruta | Responsabilidad |
| --- | --- |
| `src/extension.ts` | Integración con editor, secretos, comandos y cambios |
| `src/core/` | Clientes de IA, protocolos y validación de propuestas |
| `src/index/` | Worker, SQLite, búsqueda y exclusiones |
| `src/ui/` | Chat y Composer con CSP y salida segura |
| `product/` | Versión upstream fijada, producto y ajustes iniciales |
| `scripts/` | Compilación, distribución, diagnóstico y tests reales |
| `.upstream/vscode/` | Código fuente oficial con overlay Caled |

Fuentes vigentes consultadas el 22 de septiembre de 2026: [VSCodium](https://github.com/VSCodium/vscodium), [API inline de VS Code](https://code.visualstudio.com/api/references/vscode-api#InlineCompletionItemProvider), [Ollama](https://docs.ollama.com/api), [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/), [Kimi](https://platform.kimi.ai/docs/overview).
