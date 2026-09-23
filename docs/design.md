# Identidad de Caled 0.3

Caled es un espacio para entender y construir software. La interfaz usa instrucciones cortas y ejemplos concretos: describe tu idea, revisa los cambios y comprueba el resultado. Las aprobaciones explican el efecto de cada acción. El modelo y el perfil del agente siempre se pueden elegir.

## Marca y tipografía

El símbolo es una C abierta con un trazo que continúa hacia fuera: una forma vectorial simple, legible en la barra lateral y en el escritorio. `media/caled.svg` es el icono monocromo; `media/caled-brand.svg` conserva los colores de marca; `media/caled.ico` contiene siete tamaños entre 16 y 256 px. Se regenera con `scripts/create-icon.ps1`.

La interfaz utiliza Segoe UI Variable, Segoe UI o la fuente del sistema. El código usa Cascadia Code o Consolas. No se descarga una fuente ni se redistribuyen archivos tipográficos propietarios. Los temas se llaman **Caled Light** y **Caled Dark**: papel cálido, grafito y acentos verdes. La opción Sistema sigue la preferencia de color de Windows y conserva el alto contraste del editor.

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
