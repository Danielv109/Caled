# Cuentas de Caled / Caled accounts

Las cuentas son opcionales. Chat, edición, agentes y modelos locales funcionan sin registrarse. La versión 0.3 incluye el adaptador de autenticación y pruebas con un servidor simulado; no hay todavía un proyecto de producción conectado ni se han realizado inicios de sesión con Google, Apple o SMS reales.

Accounts are optional. Local chat, editing, agents and models work without registration. Version 0.3 includes an authentication adapter tested against simulated responses. A production project is not connected yet; real Google, Apple and SMS flows still need end-to-end validation with your credentials.

## Configuración del servicio

1. Crea un proyecto Supabase y habilita Email con **Confirm email**. Configura el correo transaccional antes de invitar usuarios externos; usa tu dominio y proveedor SMTP.
2. En los ajustes de Caled, introduce `caled.account.url` con la URL HTTPS del proyecto y `caled.account.publicKey` con su clave pública `sb_publishable_…` o `anon` heredada. Nunca incluyas claves `service_role`, claves `sb_secret_…`, secretos de Google ni claves privadas de Apple. El adaptador rechaza claves privilegiadas conocidas.
3. Para Google, configura su cliente OAuth en Google Cloud y el proveedor Google en Supabase. El callback de Google es el de Supabase: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Para Apple, configura el Services ID, la clave de Apple y el proveedor Apple en Supabase. Conserva el secreto del lado del servicio y programa su rotación según Apple. No se distribuye con Caled.
5. En la lista de redirecciones de Supabase añade `http://127.0.0.1:*/caled-account/*`. Es la dirección de retorno de esta aplicación de escritorio: puerto efímero y ruta aleatoria por intento. No amplíes el patrón a otros hosts o rutas.
6. Personaliza el correo de confirmación para mostrar `{{ .Token }}` si quieres verificar mediante el código dentro de Caled. También puedes confirmar mediante el enlace del correo y luego usar **Iniciar sesión con correo**. El `Site URL` del servicio debe apuntar a una página de confirmación tuya.
7. Para teléfono, habilita el proveedor SMS de Supabase y configura sus credenciales en el servidor. Los envíos de SMS pueden tener coste. Caled requiere primero un correo confirmado, solicita el número en formato internacional y verifica un código `phone_change` asociado a la cuenta existente. Esta verificación de contacto no implementa por sí sola autenticación de dos factores.

La configuración pública es de aplicación, no de repositorio. Las contraseñas se introducen en controles nativos del editor y no se guardan. Las sesiones y tokens de renovación se guardan en `SecretStorage`, separados por endpoint y clave pública. Nunca se pasan al panel de IA, a sus prompts ni a archivos del proyecto.

## Flujo OAuth

Google y Apple se abren en el navegador del sistema. Caled escucha temporalmente en `127.0.0.1`, valida host y ruta aleatoria de retorno y usa PKCE SHA-256 para intercambiar un código de un solo uso. No acepta tokens en la URL. Cancelar o agotar cinco minutos cierra el listener. Cada operación de red tiene su propio límite de 15 segundos y 256 KiB.

El proveedor valida credenciales, confirmación de email y SMS. El cliente no puede garantizar que el administrador mantenga activada la confirmación de correo, las cuotas o la protección contra abuso. Antes de publicar, configura rate limits, protección contra abuso, políticas de datos y correo/SMS de producción; prueba las cuentas y la entrega real. No se añade sincronización de proyectos ni envío de código al servicio de cuentas.

## Comprobaciones pendientes con el servicio configurado

- Alta con correo, confirmación y login; credenciales equivocadas y correo sin verificar.
- Google y Apple: aprobación, rechazo, cierre del navegador, callback repetido y timeout.
- SMS real: alta/cambio de número, código incorrecto, expirado y reenvío.
- Renovación y cierre de sesión; comprobar que el servidor revoca lo esperado.
- Empaquetado y retorno a la app desde un equipo limpio.

En inglés, usa **Caled: Appearance and language → Language → English** y después **Caled: Account (optional)**. La cuenta puede configurarse después: no bloquea el uso del editor.

## Referencias oficiales

- [Google con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Apple con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [URLs de retorno y patrones permitidos](https://supabase.com/docs/guides/auth/redirect-urls)
- [Correo y códigos OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Teléfono y proveedores SMS](https://supabase.com/docs/guides/auth/phone-login)
- [Correo SMTP de producción](https://supabase.com/docs/guides/auth/auth-smtp)
