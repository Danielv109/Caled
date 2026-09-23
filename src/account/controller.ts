import * as vscode from 'vscode';
import { AccountClient, AccountError, type AccountErrorCode, type AccountUser } from './client';
import { signInWithBrowser } from './oauth';

type Language = 'es' | 'en';
type Choice = vscode.QuickPickItem & { id: string };
const errors: Record<AccountErrorCode, [string, string]> = {
  config: ['Configura la URL y una clave pública de Supabase en los ajustes de Cuenta.', 'Configure the Supabase URL and public key in Account settings.'],
  input: ['Revisa los datos introducidos.', 'Check the information you entered.'],
  credentials: ['No se pudo iniciar sesión. Revisa el correo y la contraseña.', 'Could not sign in. Check your email and password.'],
  email_unconfirmed: ['Primero confirma tu correo electrónico.', 'Confirm your email address first.'],
  rate_limit: ['Se hicieron demasiados intentos. Espera antes de volver a probar.', 'Too many attempts. Wait before trying again.'],
  network: ['No se pudo conectar con el servicio de cuentas.', 'Could not connect to the account service.'],
  timeout: ['La solicitud caducó. Puedes intentarlo de nuevo.', 'The request expired. You can try again.'],
  protocol: ['El servicio de cuentas devolvió una respuesta no válida.', 'The account service returned an invalid response.'],
  provider: ['El servicio no completó la solicitud. Revisa su configuración o vuelve a intentarlo.', 'The service did not complete the request. Check its configuration or try again.'],
  signed_out: ['Inicia sesión para realizar esta acción.', 'Sign in to perform this action.'],
  cancelled: ['Inicio de sesión cancelado.', 'Sign-in cancelled.'],
};

/** Uses native inputs for credentials, never the assistant webview or model context. */
export class AccountController implements vscode.Disposable {
  private busy = false;
  private pending?: AbortController;
  constructor(private readonly context: vscode.ExtensionContext, private readonly language: () => Language) {}
  private t(es: string, en: string): string { return this.language() === 'en' ? en : es; }
  private choice(id: string, es: string, en: string, description?: string): Choice {
    return { id, label: this.t(es, en), ...(description ? { description } : {}) };
  }

  async show(): Promise<void> {
    if (this.busy) {
      void vscode.window.showInformationMessage(this.t('Ya hay una operación de cuenta en curso.', 'An account operation is already in progress.'));
      return;
    }
    this.busy = true;
    try {
      const config = vscode.workspace.getConfiguration('caled.account');
      const url = config.get<string>('url', '').trim();
      const publicKey = config.get<string>('publicKey', '').trim();
      if (!url || !publicKey) {
        const action = await vscode.window.showInformationMessage(this.t(
          'La IA local funciona sin cuenta. El inicio de sesión está preparado, pero todavía falta conectar el servicio de cuentas.',
          'Local AI works without an account. Sign-in is prepared, but the account service still needs to be connected.'),
        this.t('Abrir configuración', 'Open settings'), this.t('Guía de integración', 'Integration guide'));
        if (action === this.t('Abrir configuración', 'Open settings')) {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'caled.account');
        } else if (action === this.t('Guía de integración', 'Integration guide')) {
          await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.joinPath(this.context.extensionUri, 'docs', 'accounts.md'));
        }
        return;
      }
      const client = new AccountClient({ url, publicKey }, this.context.secrets);
      let user: AccountUser | undefined;
      try { user = await client.user(); }
      catch (error) {
        const signOut = this.t('Cerrar sesión local', 'Sign out locally');
        const selected = await vscode.window.showWarningMessage(this.message(error), signOut);
        if (selected === signOut) {
          try { await client.signOut(); }
          catch { void vscode.window.showInformationMessage(this.t(
            'Se eliminó la sesión de este equipo. No se pudo confirmar la revocación en el servidor.',
            'The session was removed from this computer. Server revocation could not be confirmed.')); }
        }
        return;
      }
      const selected = await vscode.window.showQuickPick(user ? [
        this.choice('phone', user.phoneVerified ? 'Cambiar teléfono verificado' : 'Verificar teléfono',
          user.phoneVerified ? 'Change verified phone' : 'Verify phone'),
        this.choice('logout', 'Cerrar sesión', 'Sign out'),
      ] : [
        this.choice('google', 'Continuar con Google', 'Continue with Google'),
        this.choice('apple', 'Continuar con Apple', 'Continue with Apple'),
        this.choice('login', 'Iniciar sesión con correo', 'Sign in with email'),
        this.choice('signup', 'Crear cuenta con correo', 'Create account with email'),
        this.choice('confirm', 'Verificar código de correo', 'Verify email code'),
        this.choice('resend', 'Reenviar confirmación de correo', 'Resend email confirmation'),
      ], { title: this.t('Cuenta de Caled', 'Caled account'),
        placeHolder: user ? `${user.email} · ${this.t(user.emailVerified ? 'Correo confirmado' : 'Correo sin confirmar',
          user.emailVerified ? 'Email confirmed' : 'Email not confirmed')}`
          : this.t('Opcional: puedes seguir usando tu IA local sin cuenta.', 'Optional: you can keep using local AI without an account.') });
      if (!selected) return;
      if (selected.id === 'google' || selected.id === 'apple') {
        const provider = selected.id;
        this.pending = new AbortController();
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, cancellable: true,
          title: this.t('Completa el inicio de sesión en tu navegador.', 'Complete sign-in in your browser.') }, async (_progress, token) => {
          const cancellation = token.onCancellationRequested(() => this.pending?.abort());
          try {
            await signInWithBrowser(client, provider, link => vscode.env.openExternal(vscode.Uri.parse(link)),
              { signal: this.pending!.signal, language: this.language() });
          } finally { cancellation.dispose(); }
        });
        void vscode.window.showInformationMessage(this.t('Sesión iniciada.', 'Signed in.'));
      } else if (selected.id === 'logout') {
        try { await client.signOut(); void vscode.window.showInformationMessage(this.t('Sesión cerrada.', 'Signed out.')); }
        catch { void vscode.window.showWarningMessage(this.t(
          'Se eliminó la sesión local. No se pudo confirmar la revocación en el servidor.',
          'The local session was removed. Server revocation could not be confirmed.')); }
      } else if (selected.id === 'phone') {
        if (!user?.emailVerified) throw new AccountError('email_unconfirmed');
        const phone = await vscode.window.showInputBox({ title: this.t('Verificar teléfono', 'Verify phone'),
          prompt: this.t('Número con código de país, por ejemplo +525512345678. El servicio enviará un SMS.',
            'Number with country code, for example +525512345678. The service will send an SMS.'),
          ignoreFocusOut: true, validateInput: value => /^\+[1-9]\d{7,14}$/.test(value) ? undefined
            : this.t('Usa el formato internacional con + y código de país.', 'Use international format with + and country code.') });
        if (!phone) return;
        await client.requestPhoneVerification(phone);
        const code = await this.codeInput(this.t('Código recibido por SMS', 'Code received by SMS'));
        if (!code) return;
        await client.verifyPhone(phone, code);
        void vscode.window.showInformationMessage(this.t('Teléfono verificado.', 'Phone verified.'));
      } else {
        await this.emailAction(client, selected.id);
      }
    } catch (error) {
      if (!(error instanceof AccountError && error.code === 'cancelled')) void vscode.window.showErrorMessage(this.message(error));
    } finally { this.pending = undefined; this.busy = false; }
  }

  private message(error: unknown): string {
    const code = error instanceof AccountError ? error.code : 'provider';
    return errors[code][this.language() === 'en' ? 1 : 0];
  }

  private codeInput(prompt: string): Thenable<string | undefined> {
    return vscode.window.showInputBox({ prompt, password: true, ignoreFocusOut: true,
      validateInput: value => /^\d{6,10}$/.test(value) ? undefined
        : this.t('Introduce el código numérico recibido.', 'Enter the numeric code you received.') });
  }

  private async emailAction(client: AccountClient, action: string): Promise<void> {
    const email = await vscode.window.showInputBox({ title: this.t('Correo electrónico', 'Email address'), ignoreFocusOut: true,
      validateInput: value => value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? undefined
        : this.t('Introduce un correo válido.', 'Enter a valid email address.') });
    if (!email) return;
    if (action === 'resend') {
      await client.resendConfirmation(email);
      void vscode.window.showInformationMessage(this.t('Revisa tu correo para completar la confirmación.', 'Check your inbox to complete confirmation.'));
      return;
    }
    if (action === 'confirm') {
      const code = await this.codeInput(this.t('Código recibido por correo', 'Code received by email'));
      if (!code) return;
      await client.verifyEmail(email, code);
      void vscode.window.showInformationMessage(this.t('Correo verificado. Sesión iniciada.', 'Email verified. Signed in.'));
      return;
    }
    const password = await vscode.window.showInputBox({ title: this.t('Contraseña', 'Password'), password: true, ignoreFocusOut: true,
      prompt: action === 'signup' ? this.t('Usa al menos 8 caracteres y una contraseña única.', 'Use at least 8 characters and a unique password.') : undefined,
      validateInput: value => value.length > 256 || !value.length || action === 'signup' && value.length < 8
        ? this.t('Revisa la longitud de la contraseña.', 'Check the password length.') : undefined });
    if (!password) return;
    if (action === 'signup') {
      const confirmation = await vscode.window.showInputBox({ title: this.t('Repite la contraseña', 'Repeat password'), password: true,
        ignoreFocusOut: true, validateInput: value => value === password ? undefined
          : this.t('Las contraseñas no coinciden.', 'Passwords do not match.') });
      if (confirmation !== password) return;
      const result = await client.signUp(email, password);
      void vscode.window.showInformationMessage(result === 'signed_in' ? this.t('Cuenta creada. Sesión iniciada.', 'Account created. Signed in.')
        : this.t('Revisa el correo de confirmación. Después puedes iniciar sesión aquí o introducir el código recibido.',
          'Check the confirmation email. Then sign in here or enter the code you received.'));
    } else {
      await client.signIn(email, password);
      void vscode.window.showInformationMessage(this.t('Sesión iniciada.', 'Signed in.'));
    }
  }

  dispose(): void { this.pending?.abort(); }
}
