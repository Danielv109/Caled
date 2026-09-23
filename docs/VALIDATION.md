# Validación de la entrega 0.4

Fecha: 23 de septiembre de 2026. Windows x64, Node 22.14.0, 15,5 GiB de RAM física. Editor base VSCodium 1.135.06055 / Code OSS 1.135.0.

| Comprobación | Resultado |
| --- | --- |
| TypeScript estricto | Aprobado |
| Pruebas unitarias | 271 aprobadas en 14 archivos |
| Compilación de extensión y worker | Aprobada |
| Distribución portable e integridad del ZIP upstream | Aprobadas |
| Paquete VSIX | Instalación aprobada en un perfil aislado de VS Code |
| Checkout Code OSS y overlay repetible | Preparado; núcleo no compilado |
| Integración en desktop con proveedor simulado | 19 comprobaciones aprobadas |
| Ciclo de agente | Lectura, aprobación de edición, guardado, aprobación de comando y resultado observados |
| Recuperación | Checkpoint restaurado dentro del desktop real |
| Índice sintético | 1.000 archivos; reinicio desde SQLite sin releer fuentes |
| Revisión visual del desktop | Realizada mediante captura de la instancia de pruebas |
| Apariencia e idiomas | Claro/oscuro/sistema en el editor; panel español/inglés |
| Estudio personal | Tres pestañas, borradores, confirmación de guardado y aislamiento por carpeta |
| Acentos | Seis variantes con contraste probado; ajustes ajenos conservados |
| Cuaderno y modelo | Contexto y estilo verificados en desktop; nombre de saludo excluido de peticiones |
| Accesos directos | Escritorio, Inicio y carpeta del proyecto; inicio real y ventana visible comprobados con Windows |
| Perfiles del agente | Cinco; bloqueo de herramientas no permitidas comprobado también en desktop |
| Autenticación opcional | PKCE, sesión y verificación probados localmente; servicio real pendiente |
| Inferencia real Ollama CPU | Chat de código y propuesta validada aprobados |
| Integración desktop con modelo real | Chat, propuesta, diff y aplicación aprobados |
| Benchmark frente a Cursor | Pendiente |

Las pruebas de escritorio verifican carga de extensión, comandos, índice en worker, streaming con contexto, exclusión de secretos, generación sin mutar documentos, diff nativo, aplicación en buffers, detección de cambios del usuario, autocompletado, cancelación y el ciclo completo del agente. Antes de ejecutar el comando se comprueba que todavía no haya ocurrido; después se valida su resultado. Los fixtures y perfiles son temporales y están dentro de `artifacts/`.

En 0.3 se comprueban también los temas nativos, el perfil Revisor sin permisos de escritura/terminal, el idioma inglés y el rechazo de autorizaciones invisibles al recargar el panel. Las pruebas de cuentas usan respuestas simuladas y un callback HTTP real en loopback: no se han utilizado credenciales de Google/Apple ni enviado correos o SMS reales. Las pruebas de marca verifican siete tamaños del icono, contraste de textos principales y accesos directos Windows con rutas Unicode sin sobrescribir accesos ajenos.

La entrega 0.4 añade pruebas del cuaderno, preparación de instrucciones sin llamar al proveedor, preferencia de explicación y exclusión del nombre personal de las peticiones. El cambio de carpetas dentro de un workspace comprueba que el worker del índice vuelve a crearse: antes quedaba cerrado. Las pruebas de UI cubren formularios, navegación por teclado, confirmaciones correlacionadas, fallos, sustitución explícita de borradores y recarga sin perder ediciones posteriores a un envío.

Capturas del estudio: `artifacts/studio-dark-home.png`, `artifacts/studio-dark-project.png`, `artifacts/studio-dark-space.png` y sus variantes `studio-light-*.png`. Se obtienen con `test-desktop.mjs --capture` y `capture-studio.mjs`, sólo desde el puerto de la instancia aislada. Muestran datos de ejemplo y proveedor simulado. Las mediciones de índice siguientes pertenecen a la entrega anterior y no son una comparación de rendimiento de la interfaz nueva.

El benchmark sintético de `artifacts/index-benchmark.json` midió 1.000 archivos (~4,2 MB): carga fría 1,88 s, reinicio desde SQLite 0,48 s con 0 fuentes releídas, actualización sin cambios 0,30 s y actualización de 10 archivos 0,34 s. La búsqueda tuvo p95 entre 2,4 y 6,3 ms y el RSS máximo del proceso aislado fue ~101 MB. Excluye Electron, el modelo y cualquier comparación con Cursor.

La prueba real empleó `qwen2.5-coder:1.5b`, digest `d7372fd828518a4d38b1eb196c673c31a85f2ed302b3d1e406c4c2d1b64a0668`, descargado mediante Ollama. En una repetición con el modelo ya cargado, una función pequeña se generó en unos 804 ms y una propuesta en unos 2.675 ms. Estos son datos de **un caso pequeño con caché**, no latencias garantizadas ni comparación con otro editor. Resultados detallados en `artifacts/live-inference.json` y `artifacts/desktop-test-*/result.json`.

La primera petición real de Composer devolvió una ruta inventada (`src/sum.ts`). La validación la rechazó sin escribir archivos. La petición con la ruta explícita produjo un cambio correcto. Este resultado limita las afirmaciones de calidad: un modelo local pequeño es útil para tareas acotadas, pero no sustituye una evaluación amplia ni una revisión humana.

Durante la integración se corrigieron dos fallos que no detectaban las pruebas aisladas: retirar metadatos `defaultChatAgent` impedía arrancar el workbench, y comparar rutas Windows distinguiendo mayúsculas omitía buffers sin guardar. La distribución conserva los metadatos que exige el núcleo y desactiva su chat ajeno mediante configuración. Las pruebas de desktop cubren ambos caminos.

El arranque corrigió además un ciclo de importaciones con `await` pendiente y el uso de `windowsHide` en el proceso gráfico. El lanzador oculta sólo su consola auxiliar; el proceso del editor puede mostrar su ventana. El paquete español se instala desde Open VSX tras verificar SHA-256; su versión 1.131.0 puede dejar textos nuevos del núcleo 1.135 en inglés.

## Reproducir

```powershell
npm ci
npm run check
npm run desktop:prepare
npm run test:desktop
npm run ai:start
npm run test:live
npm run test:desktop:live
npm run ai:unload
```

SQLite puede emitir un aviso experimental bajo Node 22; el índice utiliza memoria si el runtime del editor no proporciona `node:sqlite`. Los adaptadores externos se probaron con respuestas simuladas, sin consumir APIs de pago. Los embeddings opcionales también se probaron mediante simulación; no se descargó el modelo de embeddings.
