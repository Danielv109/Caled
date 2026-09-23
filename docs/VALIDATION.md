# Validación de la entrega 0.1

Fecha: 22 de septiembre de 2026. Windows x64, Node 22.14.0, 15,5 GiB de RAM física. Editor base VSCodium 1.135.06055 / Code OSS 1.135.0.

| Comprobación | Resultado |
| --- | --- |
| TypeScript estricto | Aprobado |
| Pruebas unitarias | 79 aprobadas en 4 archivos |
| Compilación de extensión y worker | Aprobada |
| Distribución portable e integridad del ZIP upstream | Aprobadas |
| Paquete VSIX | Instalación aprobada en un perfil aislado de VS Code |
| Checkout Code OSS y overlay repetible | Preparado; núcleo no compilado |
| Integración en desktop con proveedor simulado | 10 comprobaciones aprobadas |
| Revisión visual del desktop | Realizada mediante captura de la instancia de pruebas |
| Inferencia real Ollama CPU | Chat de código y propuesta validada aprobados |
| Integración desktop con modelo real | Chat, propuesta, diff y aplicación aprobados |
| Benchmark frente a Cursor | Pendiente |

Las pruebas de escritorio verifican carga de extensión, comandos, índice en worker, streaming con contexto, exclusión de secretos, generación sin mutar documentos, diff nativo, aplicación en buffers, detección de cambios del usuario, autocompletado y cancelación. Los fixtures y perfiles son temporales y están dentro de `artifacts/`.

La prueba real empleó `qwen2.5-coder:1.5b`, digest `d7372fd828518a4d38b1eb196c673c31a85f2ed302b3d1e406c4c2d1b64a0668`, descargado mediante Ollama. En una repetición con el modelo ya cargado, una función pequeña se generó en unos 804 ms y una propuesta en unos 2.675 ms. Estos son datos de **un caso pequeño con caché**, no latencias garantizadas ni comparación con otro editor. Resultados detallados en `artifacts/live-inference.json` y `artifacts/desktop-test-*/result.json`.

La primera petición real de Composer devolvió una ruta inventada (`src/sum.ts`). La validación la rechazó sin escribir archivos. La petición con la ruta explícita produjo un cambio correcto. Este resultado limita las afirmaciones de calidad: un modelo local pequeño es útil para tareas acotadas, pero no sustituye una evaluación amplia ni una revisión humana.

Durante la integración se corrigieron dos fallos que no detectaban las pruebas aisladas: retirar metadatos `defaultChatAgent` impedía arrancar el workbench, y comparar rutas Windows distinguiendo mayúsculas omitía buffers sin guardar. La distribución conserva los metadatos que exige el núcleo y desactiva su chat ajeno mediante configuración. Las pruebas de desktop cubren ambos caminos.

## Reproducir

```powershell
npm ci
npm run check
npm run desktop:prepare
npm run test:desktop
npm run ai:start
npm run test:live
npm run test:desktop -- --live
npm run ai:unload
```

SQLite puede emitir un aviso experimental bajo Node 22; el índice utiliza memoria si el runtime del editor no proporciona `node:sqlite`. Los adaptadores externos se probaron con respuestas simuladas, sin consumir APIs de pago. Los embeddings opcionales también se probaron mediante simulación; no se descargó el modelo de embeddings.
