# Identidad de Caled 0.4

Caled es un espacio para entender y construir software. La interfaz usa instrucciones cortas y ejemplos concretos: describe tu idea, revisa los cambios y comprueba el resultado. Las aprobaciones explican el efecto de cada acción. El modelo y el perfil del agente siempre se pueden elegir.

## El estudio y el cuaderno

El estudio tiene tres espacios: Inicio para orientarse, Proyecto para dar forma a una idea y Mi espacio para personalizar la experiencia. La composición se apoya en márgenes, tipografía, líneas y controles explícitos. No añade estadísticas de actividad ni progreso inventado. Funciona sin cuenta y sin cargar recursos remotos.

El cuaderno organiza objetivo, público y criterios de éxito. Sus acciones preparan instrucciones revisables en el asistente: Planificar usa Guía, Construir usa Constructor y Comprobar usa Verificador. La preparación no inicia un modelo. Guardar usa el almacenamiento local del editor, separado por carpeta, con límites de longitud y sin crear archivos en el repositorio. Al enviar a la IA, el cuaderno se incorpora como contexto no confiable: no puede conceder permisos.

Guiado explica términos y pasos; Equilibrado resume el resultado y su comprobación; Directo reduce el detalle manteniendo evidencia y límites. Esta preferencia cambia las instrucciones del modelo. El nombre de saludo se utiliza únicamente en la interfaz. El campo completo de personalización está excluido de Settings Sync.

## Marca y tipografía

El símbolo es una C abierta con un trazo que continúa hacia fuera: una forma vectorial simple, legible en la barra lateral y en el escritorio. `media/caled.svg` es el icono monocromo; `media/caled-brand.svg` conserva los colores de marca; `media/caled.ico` contiene siete tamaños entre 16 y 256 px. Se regenera con `scripts/create-icon.ps1`.

La interfaz utiliza Segoe UI Variable, Segoe UI o la fuente del sistema. El código usa Cascadia Code o Consolas. No se descarga una fuente ni se redistribuyen archivos tipográficos propietarios. Los temas se llaman **Caled Light** y **Caled Dark**: papel cálido, grafito y acentos verdes. La opción Sistema sigue la preferencia de color de Windows y conserva el alto contraste del editor.

Sobre estos temas se pueden elegir acentos Salvia, Océano y Arcilla. Cada uno tiene variantes específicas para claro y oscuro: se prueban contraste de texto, botones, enlaces, selección e insignias. Se aplican únicamente a `[Caled Light]` y `[Caled Dark]`, conservando personalizaciones ajenas a las claves del acento. Ninguno requiere animaciones ni un proceso residente adicional.

La identidad se aplica al editor, sus pestañas, menús, terminal, notificaciones y panel de Caled. La estructura base sigue siendo Code OSS: este trabajo no sustituye el núcleo ni todos sus menús. El ejecutable upstream conserva sus recursos y firma; el acceso directo usa el icono de Caled, pero algunos elementos nativos pueden mostrar todavía el de VSCodium.

## Idiomas y accesibilidad

El panel, inicio, perfil, preferencias y flujos de cuenta tienen español e inglés. `desktop:prepare` instala el paquete oficial `MS-CEINTL.vscode-language-pack-es`, fijado a 1.131.0 con checksum SHA-256 de Open VSX. El núcleo es 1.135: textos añadidos después del paquete pueden mostrarse en inglés. El lanzador aplica el idioma elegido a los menús nativos al reiniciar Caled. El contenido generado por el modelo se conserva como texto y se le solicita responder en el idioma seleccionado. Algunos diagnósticos técnicos internos conservan su idioma original.

Los controles tienen nombres accesibles, foco visible, navegación por teclado y estados anunciados. Los textos y botones principales de ambos temas se prueban con contraste mínimo 4,5:1. Las animaciones respetan la preferencia de movimiento reducido. Esto es una base verificada, no una auditoría formal de accesibilidad completa.

## Cinco perfiles, una tarea activa

| Perfil | Uso | Cambios | Comandos |
| --- | --- | --- | --- |
| Guía / Guide | Entender el proyecto y preparar un plan | No | No |
| Constructor / Builder | Convertir una idea en cambios pequeños | Con aprobación | Con aprobación |
| Reparador / Fixer | Investigar y corregir la causa de un error | Con aprobación | Con aprobación |
| Revisor / Reviewer | Detectar problemas concretos y explicar su impacto | No | No |
| Verificador / Tester | Ejecutar comprobaciones y reportar sus resultados | No por herramienta de edición | Con aprobación |

No son cinco modelos residentes: son especializaciones de una misma ejecución, con instrucciones y permisos distintos. Hay cinco perfiles, por debajo del máximo de diez solicitado. El motor bloquea las herramientas fuera de los permisos del perfil. Los comandos autorizados se ejecutan con los permisos del usuario y pueden tener efectos fuera de la carpeta; no son un sandbox.
