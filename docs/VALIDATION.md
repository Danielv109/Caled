# Validación de la entrega 0.3

Fecha: 22 de septiembre de 2026. Windows x64, Node 22.14.0, 15,5 GiB de RAM física. Editor base VSCodium 1.135.06055 / Code OSS 1.135.0.

| Comprobación | Resultado |
| --- | --- |
| TypeScript estricto | Aprobado |
| Pruebas unitarias | 203 aprobadas en 12 archivos |
| Compilación de extensión y worker | Aprobada |
| Distribución portable e integridad del ZIP upstream | Aprobadas |
| Paquete VSIX | Instalación aprobada en un perfil aislado de VS Code |
| Checkout Code OSS y overlay repetible | Preparado; núcleo no compilado |
| Integración en desktop con proveedor simulado | 15 comprobaciones aprobadas |
| Ciclo de agente | Lectura, aprobación de edición, guardado, aprobación de comando y resultado observados |
| Recuperación | Checkpoint restaurado dentro del desktop real |
| Índice sintético | 1.000 archivos; reinicio desde SQLite sin releer fuentes |
| Revisión visual del desktop | Realizada mediante captura de la instancia de pruebas |
| Apariencia e idiomas | Claro/oscuro/sistema en el editor; panel español/inglés |
| Accesos directos | Escritorio, Inicio y carpeta del proyecto; inicio real y ventana visible comprobados con Windows |
| Perfiles del agente | Cinco; bloqueo de herramientas no permitidas comprobado también en desktop |
| Autenticación opcional | PKCE, sesión y verificación probados localmente; servicio real pendiente |
| Inferencia real Ollama CPU | Chat de código y propuesta validada aprobados |
| Integración desktop con modelo real | Chat, propuesta, diff y aplicación aprobados |
| Benchmark frente a Cursor | Pendiente |

Las pruebas de escritorio verifican carga de extensión, comandos, índice en worker, streaming con contexto, exclusión de secretos, generación sin mutar documentos, diff nativo, aplicación en buffers, detección de cambios del usuario, autocompletado, cancelación y el ciclo completo del agente. Antes de ejecutar el comando se comprueba que todavía no haya ocurrido; después se valida su resultado. Los fixtures y perfiles son temporales y están dentro de `artifacts/`.

En 0.3 se comprueban también los temas nativos, el perfil Revisor sin permisos de escritura/terminal, el idioma inglés y el rechazo de autorizaciones invisibles al recargar el panel. Las pruebas de cuentas usan respuestas simuladas y un callback HTTP real en loopback: no se han utilizado credenciales de Google/Apple ni enviado correos o SMS reales. Las pruebas de marca verifican siete tamaños del icono, contraste de textos principales y accesos directos Windows con rutas Unicode sin sobrescribir accesos ajenos.

Capturas de esta entrega: `artifacts/caled-dark-es.png` y `artifacts/caled-light-en.png`. Muestran el panel y el inicio propios en una instancia de pruebas con menús nativos en inglés. La comprobación `artifacts/desktop-window-check.json` confirma una ventana visible de la aplicación normal después de abrir el acceso directo. El VSIX 0.3 se instaló además en un perfil aislado de VS Code y su CLI confirmó `caled.caled@0.3.0`.

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
