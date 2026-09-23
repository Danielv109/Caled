# Plan de ejecución de Caled

Objetivo: editor con IA integrada, uso local sin cuota y mantenimiento razonable del núcleo. «Mismas funciones que Cursor» es una meta de producto, no una capacidad completada por esta primera entrega.

## 1. Base y distribución — completado para Windows x64

- [x] Seleccionar Code OSS/VSCodium, conservar licencias y Open VSX.
- [x] Fijar release, commit y checksum oficial; descarga verificada.
- [x] Distribución portable con perfil aislado y Caled incorporado.
- [x] Descargar checkout del núcleo y aplicar overlay reproducible.
- [x] Probar arranque, carga de extensión y funciones dentro del desktop.
- [ ] Compilar núcleo completo con Node/Python/C++ apropiados.
- [ ] Crear instalador y ejecutable con iconos, recursos y firma propios.

## 2. IA y contexto — primera implementación completada

- [x] Local por defecto; APIs externas opcionales y claves en SecretStorage.
- [x] Ollama NDJSON y APIs compatibles SSE; UTF-8, cancelación y timeout.
- [x] Descubrimiento dinámico de modelos, sin depender de un catálogo congelado.
- [x] Chat y autocompletado inline, debounce y caché breve.
- [x] Contexto acotado en worker; SQLite opcional en el runtime.
- [x] Búsqueda léxica y reranking opcional con embeddings locales.
- [x] Preparar Ollama CPU y Qwen2.5-Coder 1.5B; probar generación y propuestas reales en este equipo.
- [ ] Indexación incremental por hash y parser estructural de funciones/clases.
- [ ] Evaluar búsqueda vectorial global y embeddings en segundo plano bajo presupuesto.
- [ ] Soportar varias carpetas, SSH/contenedores y repositorios muy grandes.

## 3. Edición asistida — primera implementación completada

- [x] Propuestas de varios archivos con sustituciones exactas.
- [x] Diff nativo y aplicación explícita con deshacer del editor.
- [x] Protección frente a archivos modificados y rutas inseguras.
- [ ] Checkpoints recuperables para operaciones largas y reinicios.
- [ ] Diffs dentro de las líneas con aceptar/rechazar cada bloque.
- [ ] Next-edit prediction, saltos entre archivos y edición de notebook.

No es necesario modificar Monaco para el autocompletado inicial. La API pública ya lo permite. Los cambios al núcleo se introducirán sólo para funciones concretas, pequeños y acompañados de pruebas de actualización.

## 4. Agente de programación — pendiente

- [ ] Bucle de herramientas: buscar, leer, diagnosticar, editar, ejecutar pruebas y revisar resultados.
- [ ] Política de permisos para terminal y acceso de red, con límites verificables.
- [ ] Ejecución por pasos, interrupción y recuperación tras fallos.
- [ ] MCP, reglas del proyecto y gestión de contexto por tarea.
- [ ] Agentes paralelos y worktrees aislados cuando el modelo y hardware lo permitan.

La versión actual propone cambios; no afirma ejecutar comandos ni completar tareas autónomas.

## 5. Rendimiento y publicación — pendiente

- [ ] Comparar Caled, VSCodium base y Cursor usando el mismo proyecto, equipo y extensiones.
- [ ] Medir arranque frío/caliente, RAM total, CPU en reposo, latencia p50/p95 y fluidez al escribir.
- [ ] Separar métricas del editor y del servidor de modelos: una IA local puede gastar más RAM total que una remota.
- [ ] Usar mediciones para decidir qué servicios del núcleo desactivar o reemplazar.
- [ ] CI de actualización mensual: rebase limpio, pruebas y artefacto reproducible.
- [ ] Builds Windows ARM64, Linux y macOS; instalador y actualizaciones propias.
- [ ] Evaluaciones reales de calidad, accesibilidad y pruebas con usuarios.

## Condición de finalización

La meta completa se considerará lograda cuando exista un build propio reproducible, la matriz de funciones priorizadas esté implementada, la IA local esté validada en hardware objetivo y las mediciones demuestren las mejoras de rendimiento. No se marcarán estos hitos como completados sólo por disponer de un plan o de mocks.
