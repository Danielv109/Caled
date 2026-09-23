# Proveedores de IA

El motor se ejecuta en el host de extensiones. No depende de SDK externos ni envía solicitudes hasta que una función del editor lo invoca. Las claves pertenecen al usuario; la capa de integración debe almacenarlas con `SecretStorage`, nunca en archivos del proyecto ni en el frontend.

| Proveedor | URL base | Modelo inicial | Coste del servicio |
| --- | --- | --- | --- |
| Ollama | `http://127.0.0.1:11434` | `qwen2.5-coder:3b` | Ejecución local; requiere descargar el modelo y recursos del equipo. |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash` | API comercial con clave y facturación del proveedor. |
| Kimi | `https://api.moonshot.ai/v1` | `kimi-k3` | API comercial con clave y facturación del proveedor. |
| Compatible | `http://127.0.0.1:1234/v1` | Seleccionar mediante descubrimiento | Depende del servidor y del modelo. |

`qwen2.5-coder:3b` es una opción compacta inicial, no una afirmación de que sea el modelo más reciente. Antes de usarlo hay que instalar Ollama y descargarlo mediante `ollama pull qwen2.5-coder:3b`. La aplicación no descarga modelos automáticamente. El identificador `local-model` de servidores compatibles es un marcador: selecciona el identificador real que devuelve `/models`.

Los nombres de modelos son configurables y el descubrimiento consulta `/api/tags` en Ollama o `/models` en los servicios compatibles. Esto permite elegir nuevos modelos sin recompilar el editor. Los modelos remotos pueden cambiar de disponibilidad, tarifa y parámetros admitidos.

## Protocolo y límites

- Ollama: `POST /api/chat`, NDJSON, opciones `temperature` y `num_predict`; listado `GET /api/tags`.
- DeepSeek, Kimi y compatibles: `POST /chat/completions`, SSE, opciones `temperature` y `max_tokens`; listado `GET /models`.
- Las opciones ausentes se omiten. Cada modelo conserva sus valores predeterminados; algunos modelos de razonamiento restringen la temperatura. No se muestra `reasoning_content` como si fuera la respuesta del asistente.
- Tiempo máximo de toda la operación: 120 segundos por defecto, configurable entre 1 y 600000 ms. Cancelación desde el editor interrumpe la red y libera el lector del stream.
- Líneas y eventos: hasta 1048576 caracteres; listado de modelos: hasta 2097152 caracteres; conversación: hasta 256 mensajes y 8388608 caracteres. Son límites de memoria de la aplicación, no límites de contexto del modelo.
- UTF-8 se decodifica incrementalmente; se soportan saltos LF, CRLF y CR, comentarios SSE y datos divididos entre paquetes. Un cierre sin marcador final se considera interrupción, salvo que el servicio compatible ya haya enviado `finish_reason`.
- Se permite HTTPS o HTTP exclusivamente en loopback (`localhost`, `127.0.0.0/8`, `::1`). Se rechazan credenciales dentro de la URL, parámetros de consulta y redirecciones. Para servidores en la red local, configura TLS.
- Errores de red y del proveedor no reproducen cuerpos remotos ni mensajes arbitrarios que puedan contener claves o código fuente. `ProviderError` expone un `code` estable y el estado HTTP cuando existe. No hay reintentos automáticos que dupliquen solicitudes facturables.

El motor sólo procesa chat de texto. Las llamadas a herramientas, visión, embeddings y la gestión del consentimiento para compartir contexto corresponden a capas distintas y no se simulan aquí. Ningún endpoint comercial se vuelve gratuito por integrarlo en el editor.

## Fuentes verificadas

Consultadas el 22 de septiembre de 2026:

- [Ollama: chat](https://docs.ollama.com/api/chat) y [modelos instalados](https://docs.ollama.com/api/tags).
- [DeepSeek: cambios del servicio](https://api-docs.deepseek.com/updates/) y [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/). El cambio de septiembre introduce `deepseek-flash`; por eso no se fija el antiguo alias `deepseek-chat`.
- [Kimi: inicio rápido](https://platform.kimi.ai/docs/overview), que publica `kimi-k3` y conserva la URL base de Moonshot. Su disponibilidad efectiva se comprueba en la cuenta del usuario mediante descubrimiento de modelos.

Las pruebas de protocolo usan `fetch` y `Response` simulados con streams reales en memoria; no consumen inferencia ni crédito de proveedores externos.
