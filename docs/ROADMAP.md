# Plan de ejecución de Caled

Objetivo: editor con IA integrada, uso local sin cuota y mantenimiento razonable del núcleo. «Mismas funciones que Cursor» es una meta de producto, no una capacidad completada por esta primera entrega.

## 1. Base y distribución — completado para Windows x64

- [x] Seleccionar Code OSS/VSCodium, conservar licencias y Open VSX.
- [x] Fijar release, commit y checksum oficial; descarga verificada.
- [x] Distribución portable con perfil aislado y Caled incorporado.
- [x] Descargar checkout del núcleo y aplicar overlay reproducible.
- [x] Probar arranque, carga de extensión y funciones dentro del desktop.
- [x] Corregir el arranque desde PowerShell y añadir accesos propios en Escritorio e Inicio, sin Node global.
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
- [x] Indexación incremental con caché persistente y detección de cambios de contenido.
- [ ] Parser estructural de funciones/clases.
- [ ] Evaluar búsqueda vectorial global y embeddings en segundo plano bajo presupuesto.
- [ ] Soportar varias carpetas, SSH/contenedores y repositorios muy grandes.

## 3. Edición asistida — primera implementación completada

- [x] Propuestas de varios archivos con sustituciones exactas.
- [x] Diff nativo y aplicación explícita con deshacer del editor.
- [x] Protección frente a archivos modificados y rutas inseguras.
- [x] Checkpoints recuperables y persistentes, con validación contra cambios posteriores.
- [ ] Diffs dentro de las líneas con aceptar/rechazar cada bloque.
- [ ] Next-edit prediction, saltos entre archivos y edición de notebook.

No es necesario modificar Monaco para el autocompletado inicial. La API pública ya lo permite. Los cambios al núcleo se introducirán sólo para funciones concretas, pequeños y acompañados de pruebas de actualización.

## 4. Agente de programación — primera implementación completada

- [x] Bucle de herramientas: listar, buscar, leer, diagnosticar, editar, ejecutar comandos y observar resultados.
- [x] Aprobación individual de cambios y comandos, con límites de salida, tiempo y cancelación del árbol de procesos.
- [x] Ejecución visible por pasos, interrupción y checkpoints restaurables.
- [x] Cinco perfiles bilingües; permisos de herramientas comprobados por el motor, con una tarea activa.
- [ ] MCP, reglas del proyecto y gestión de contexto por tarea.
- [ ] Agentes paralelos y worktrees aislados cuando el modelo y hardware lo permitan.

El agente no es un sandbox: un comando autorizado usa los permisos normales del usuario. La interfaz muestra el comando exacto y la carpeta antes de ejecutarlo.

## 5. Identidad, acceso y cuentas — entrega 0.3

- [x] Símbolo vectorial, icono de escritorio y tipografía del sistema.
- [x] Pantalla de inicio con creación/apertura de proyectos e instrucciones para principiantes.
- [x] Temas claro, oscuro y sistema aplicados al editor y al panel.
- [x] Español/inglés en los flujos propios y paquete de español para menús nativos.
- [x] Contraste de textos principales, teclado, foco y movimiento reducido verificados.
- [x] Integración opcional de cuentas: Google/Apple con PKCE, email, confirmación y teléfono; sesiones en SecretStorage.
- [x] Pruebas locales de autenticación, cancelación, timeout y callbacks inválidos.
- [ ] Conectar proyecto de autenticación, credenciales OAuth y proveedores de correo/SMS de producción.
- [ ] Validar Google, Apple, entrega real de correo/SMS y renovación de sesiones de extremo a extremo.
- [ ] Auditoría completa de accesibilidad y pruebas con principiantes.

La integración de cuentas está preparada; no hay autenticación pública activa ni cuenta obligatoria. Los iconos nativos del ejecutable y parte de la estructura siguen siendo de VSCodium/Code OSS.

## 6. Estudio personal y cuaderno — entrega 0.4

- [x] Estudio con Inicio, Proyecto y Mi espacio; identidad coherente y navegación propia.
- [x] Cuaderno local por carpeta: objetivo, público y criterios de éxito, sin modificar el repositorio.
- [x] Instrucciones revisables para planificar, construir y comprobar; preparar no llama a la IA.
- [x] Tres niveles de explicación conectados con los prompts de chat, edición y agentes.
- [x] Tres acentos compatibles con claro/oscuro; preservar ajustes de color ajenos a Caled.
- [x] Nombre de saludo local, excluido de los prompts y de la sincronización de ajustes.
- [x] Conservar borradores existentes y distinguir guardado confirmado de envío pendiente.
- [ ] Evaluar la experiencia con personas que están aprendiendo a programar.

## 7. Rendimiento y publicación — pendiente

- [ ] Comparar Caled, VSCodium base y Cursor usando el mismo proyecto, equipo y extensiones.
- [ ] Medir arranque frío/caliente, RAM total, CPU en reposo, latencia p50/p95 y fluidez al escribir.
- [ ] Separar métricas del editor y del servidor de modelos: una IA local puede gastar más RAM total que una remota.
- [ ] Usar mediciones para decidir qué servicios del núcleo desactivar o reemplazar.
- [ ] CI de actualización mensual: rebase limpio, pruebas y artefacto reproducible.
- [ ] Builds Windows ARM64, Linux y macOS; instalador y actualizaciones propias.
- [ ] Evaluaciones reales de calidad, accesibilidad y pruebas con usuarios.

## Condición de finalización

La meta completa se considerará lograda cuando exista un build propio reproducible, la matriz de funciones priorizadas esté implementada, la IA local esté validada en hardware objetivo y las mediciones demuestren las mejoras de rendimiento. No se marcarán estos hitos como completados sólo por disponer de un plan o de mocks.
