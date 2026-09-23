import { english, escapeInterfaceHtml, interfaceText, type InterfaceLanguage, type InterfaceText } from './i18n';

/** The panel never interprets model output as HTML or stores provider credentials. */
export function renderWebview(nonce: string, language: InterfaceLanguage = 'es'): string {
  if (!/^[A-Za-z0-9+/_=-]{16,128}$/u.test(nonce)) {
    throw new Error('El nonce de la vista no es válido.');
  }

  const locale: InterfaceLanguage = language === 'en' ? 'en' : 'es';
  const t = (text: InterfaceText): string => escapeInterfaceHtml(interfaceText(text, locale));
  const dictionary = JSON.stringify(locale === 'en' ? english : {}).replaceAll('<', '\\u003c');

  return /* html */ `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';">
  <title>Caled · ${t('Tu espacio para crear')}</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; --accent: var(--vscode-button-background, #286c52); --accent-text: var(--vscode-button-foreground, #fff); --fg: var(--vscode-foreground, #e5e8e2); --muted: var(--vscode-descriptionForeground, #a3b0a6); --surface: var(--vscode-sideBar-background, #171b1a); --input: var(--vscode-input-background, #202623); --line: var(--vscode-widget-border, #3c4941); --focus: var(--vscode-focusBorder, #7cbea0); }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body.vscode-light, body.vscode-high-contrast-light { color-scheme: light; }
    body.vscode-dark, body.vscode-high-contrast { color-scheme: dark; }
    body { color: var(--fg); background: var(--surface); font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif; font-size: var(--vscode-font-size, 13px); }
    button, textarea { font: inherit; }
    .topbar > .brand { border:0; background:transparent; padding:0; cursor:pointer; }
    .proposal pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:180px; overflow:auto; }
    button { color: inherit; cursor: pointer; }
    button:disabled { cursor: default; opacity: .45; }
    button:focus-visible, textarea:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
    button { -webkit-tap-highlight-color: transparent; }
    [hidden] { display: none !important; }
    svg { width: 16px; height: 16px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
    .app { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .topbar { display: flex; align-items: center; gap: 8px; padding: 15px 16px 12px; flex: 0 0 auto; }
    .brand { display: flex; align-items: center; gap: 9px; font-size: 22px; letter-spacing: -1px; font-weight: 600; }
    .brand-mark { width: 28px; height: 28px; color: var(--vscode-textLink-foreground, #7cbea0); }
    .brand-caption { font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--muted); padding-left: 4px; }
    .top-actions { margin-left: auto; display: flex; gap: 3px; }
    .icon-button { border: 0; background: transparent; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; }
    .icon-button:hover:enabled { background: var(--vscode-toolbar-hoverBackground, #ffffff12); }
    .mode-bar { display: flex; flex-wrap: wrap; padding: 0 16px 12px; gap: 4px; border-bottom: 1px solid var(--line); }
    .mode { border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 9px 12px; font-size: 12px; min-height: 36px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
    .mode[aria-pressed="true"] { background: var(--vscode-toolbar-activeBackground, #ffffff0e); color: var(--fg); border-color: var(--line); }
    .mode svg { width: 13px; height: 13px; }
    .mode-detail { margin-left: auto; align-self: center; color: var(--muted); font-size: 10px; }
    .scroll { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; padding: 0 16px 20px; }
    .welcome { padding: clamp(20px, 5vh, 42px) 0 14px; max-width: 550px; margin: auto; }
    .eyebrow { color: var(--muted); text-transform: uppercase; font-size: 9px; line-height: 1.7; font-weight: 600; letter-spacing: 1.7px; margin-bottom: 12px; }
    h1 { margin: 0 0 11px; font-weight: 570; font-size: clamp(28px, 7vw, 38px); line-height: 1.2; letter-spacing: -1px; }
    .intro { color: var(--muted); line-height: 1.65; margin: 0 0 20px; font-size: 13px; max-width: 420px; }
    .quick-list { display: flex; flex-direction: column; gap: 8px; }
    .quick { display: flex; align-items: center; text-align: left; width: 100%; border: 1px solid var(--line); border-radius: 9px; background: transparent; padding: 13px 12px; gap: 12px; transition: background .12s, border-color .12s; }
    .quick:hover:enabled { background: var(--vscode-list-hoverBackground, #ffffff07); border-color: var(--focus); }
    .quick > svg { color: var(--muted); width: 18px; height: 18px; }
    .quick-copy { flex: 1; min-width: 0; }
    .quick-title { display: block; font-weight: 550; font-size: 12px; margin-bottom: 3px; }
    .quick-caption { display: block; font-size: 10px; line-height: 1.5; color: var(--muted); }
    .quick-arrow { color: var(--muted); font-size: 17px; }
    .welcome-note { margin-top: 20px; color: var(--muted); font-size: 10px; line-height: 1.6; }
    .conversation { display: flex; flex-direction: column; gap: 22px; padding-top: 22px; }
    .message { min-width: 0; animation: enter .16s ease-out; }
    .message-label { display: flex; align-items: center; gap: 7px; font-size: 10px; font-weight: 650; margin-bottom: 9px; }
    .message-label .avatar { width: 17px; height: 17px; display: inline-flex; align-items: center; justify-content: center; border-radius: 5px; border: 1px solid var(--line); font-size: 9px; }
    .message.user .message-label { color: var(--muted); }
    .message-content { line-height: 1.7; overflow-wrap: anywhere; font-size: 12px; white-space: pre-wrap; }
    .message.user .message-content { padding: 11px 13px; background: var(--vscode-editor-background, #1b201d); border: 1px solid var(--line); border-radius: 9px; }
    .message.assistant.streaming .message-content::after { content: ''; display: inline-block; margin-left: 4px; width: 6px; height: 12px; vertical-align: -2px; background: var(--fg); animation: blink 1s step-end infinite; }
    .prose { white-space: pre-wrap; margin: 0; }
    .code-block { margin: 12px 0; border: 1px solid var(--line); border-radius: 7px; background: var(--vscode-editor-background, #1b201d); overflow: hidden; white-space: normal; }
    .code-language { padding: 5px 10px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 10px; }
    pre { margin: 0; padding: 11px; overflow-x: auto; white-space: pre; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; line-height: 1.6; }
    code { font-family: inherit; }
    .notice { border-left: 2px solid var(--vscode-textLink-foreground, #7cbea0); padding: 3px 0 3px 10px; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted); }
    .notice.error { border-color: var(--vscode-errorForeground, #ed8989); color: var(--vscode-errorForeground, #ed8989); }
    .proposal { border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--vscode-editor-background, #1b201d); }
    .proposal-main { padding: 13px; }
    .proposal-heading { font-size: 11px; font-weight: 600; margin: 0 0 8px; }
    .proposal-summary { font-size: 11px; line-height: 1.6; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 10px; }
    .proposal-files { list-style: none; padding: 0; margin: 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 10px; line-height: 1.9; overflow-wrap: anywhere; }
    .proposal-files li::before { content: '↳'; color: var(--muted); margin-right: 7px; }
    .proposal-actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 12px; border-top: 1px solid var(--line); }
    .small-button { min-height: 32px; padding: 7px 10px; border: 1px solid var(--line); background: transparent; border-radius: 5px; font-size: 10px; }
    .small-button:hover:enabled { background: var(--vscode-toolbar-hoverBackground, #ffffff12); }
    .small-button.primary { background: var(--accent); color: var(--accent-text); border-color: transparent; }
    .proposal-result { font-size: 10px; color: var(--muted); padding: 10px 13px; border-top: 1px solid var(--line); }
    .approval { border-color: var(--vscode-editorWarning-foreground, #e3bc72); }
    .approval pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 9px 0; user-select: text; }
    .approval-location { font-size: 10px; line-height: 1.7; color: var(--muted); overflow-wrap: anywhere; white-space: pre-wrap; }
    .timeline { border-left: 1px solid var(--line); margin-left: 7px; padding-left: 15px; }
    .timeline-heading { font-size: 11px; font-weight: 600; margin: 0 0 12px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
    .step-heading { display: flex; gap: 7px; align-items: baseline; font-size: 11px; overflow-wrap: anywhere; }
    .step-status { margin-left: auto; font-size: 9px; flex-shrink: 0; color: var(--muted); }
    .step[data-status="error"] .step-status { color: var(--vscode-errorForeground, #ed8989); }
    .step[data-status="done"] .step-status { color: var(--vscode-testing-iconPassed, #83c3a7); }
    .step details { margin-top: 5px; }
    summary { cursor: pointer; font-size: 10px; color: var(--muted); line-height: 1.7; }
    .step pre { max-height: 230px; padding: 8px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .checkpoint-panel { margin-top: 15px; border: 1px solid var(--line); border-radius: 9px; padding: 11px; }
    .checkpoint-panel > summary { color: var(--fg); font-weight: 600; font-size: 11px; }
    .checkpoint { padding: 11px 0; border-bottom: 1px solid var(--line); }
    .checkpoint:last-child { border-bottom: 0; padding-bottom: 0; }
    .checkpoint-title { font-size: 11px; margin: 0 0 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .checkpoint-time { display: block; margin-bottom: 6px; font-size: 9px; color: var(--muted); }
    .checkpoint .small-button { margin-top: 7px; }
    .checkpoint-empty { font-size: 11px; color: var(--muted); line-height: 1.6; }
    .composer-area { flex: 0 0 auto; padding: 0 12px 10px; }
    .trust-notice { font-size: 11px; line-height: 1.55; color: var(--vscode-editorWarning-foreground, #e3bc72); padding: 10px 4px; }
    .composer { border: 1px solid var(--line); border-radius: 11px; background: var(--input); overflow: hidden; }
    .composer:focus-within { border-color: var(--focus); }
    textarea { display: block; background: transparent; color: var(--vscode-input-foreground, var(--fg)); border: 0; width: 100%; resize: none; min-height: 68px; max-height: 180px; padding: 12px 12px 7px; line-height: 1.6; font-size: 13px; outline: none; }
    textarea::placeholder { color: var(--vscode-input-placeholderForeground, var(--muted)); opacity: .85; }
    textarea:disabled { opacity: .65; }
    .composer-toolbar { display: flex; align-items: center; gap: 7px; padding: 3px 8px 8px; }
    .model-button { min-width: 0; max-width: calc(100% - 45px); display: flex; align-items: center; gap: 5px; border: 0; border-radius: 5px; padding: 5px; background: transparent; font-size: 10px; color: var(--muted); }
    .model-button:hover:enabled { color: var(--fg); background: var(--vscode-toolbar-hoverBackground, #ffffff12); }
    .model-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .model-button svg { width: 11px; height: 11px; }
    .send-button { margin-left: auto; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 7px; background: var(--accent); color: var(--accent-text); }
    .send-button:hover:enabled { filter: brightness(1.12); }
    .send-button svg { width: 15px; height: 15px; }
    .send-button.cancel { background: var(--vscode-button-secondaryBackground, #35463d); color: var(--fg); }
    .footer { display: flex; justify-content: space-between; align-items: center; gap: 7px; padding: 8px 3px 0; font-size: 9px; line-height: 1.5; color: var(--muted); }
    .context-button { display: flex; align-items: center; gap: 5px; color: var(--muted); border: 0; background: transparent; padding: 1px; font-size: 9px; min-width: 0; }
    .context-button:hover:enabled { color: var(--fg); }
    .context-button span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--muted); flex: 0 0 auto; }
    .status-dot.ready { background: var(--vscode-testing-iconPassed, #83c3a7); }
    .status-dot.busy { animation: blink 1s step-end infinite; background: var(--vscode-progressBar-background, #7cbea0); }
    .keyboard-hint { white-space: nowrap; opacity: .75; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @keyframes blink { 50% { opacity: .25; } }
    @keyframes enter { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
    @media (prefers-reduced-motion: reduce) { *, *::after { animation: none !important; transition: none !important; } }
    @media (max-width: 400px) { .brand-caption, .mode-detail { display: none; } }
    @media (max-width: 270px) { .topbar { padding-left: 10px; padding-right: 10px; } .keyboard-hint { display: none; } .scroll { padding-left: 10px; padding-right: 10px; } .mode-bar { padding-left: 10px; } .mode { padding: 6px 8px; } .quick { gap: 8px; } }
    body.vscode-high-contrast-light .quick, body.vscode-high-contrast-light .composer, body.vscode-high-contrast-light .proposal, body.vscode-high-contrast-light .checkpoint-panel, body.vscode-high-contrast .quick, body.vscode-high-contrast .composer, body.vscode-high-contrast .proposal, body.vscode-high-contrast .checkpoint-panel { border-color: var(--vscode-contrastBorder, var(--fg)); }
    .preference-bar { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 14px 13px; border-bottom: 1px solid var(--line); }
    .text-button { display: inline-flex; gap: 7px; align-items: center; min-height: 32px; padding: 5px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); font-size: 11px; }
    .text-button:hover:enabled { background: var(--vscode-toolbar-hoverBackground, #ffffff12); color: var(--fg); }
    .preference-bar .account { margin-left: auto; }
    .mode-bar { padding-top: 12px; border-bottom: 0; }
    .agent-profile { padding: 0 16px 12px; border-bottom: 1px solid var(--line); }
    .agent-select { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--line); border-radius: 7px; width: 100%; min-height: 38px; text-align: left; padding: 8px 10px; }
    .agent-select strong { font-size: 12px; font-weight: 600; }
    .agent-select svg:last-child { margin-left: auto; }
    .agent-description { margin: 7px 0 0; font-size: 11px; line-height: 1.55; color: var(--muted); }
    .project-entry { border: 1px solid var(--line); border-left: 3px solid var(--vscode-textLink-foreground, #7cbea0); padding: 12px; margin: 0 0 20px; border-radius: 6px; }
    .project-entry p { margin: 5px 0 0; color: var(--muted); line-height: 1.6; font-size: 11px; }
    .project-entry .small-button { font-size: 12px; }
    .getting-started { margin: 0 0 24px; }
    .getting-started > summary { padding: 4px 0; font-size: 12px; color: var(--fg); }
    .getting-started ol { margin: 13px 0 0; padding: 0; list-style: none; counter-reset: guide; display: grid; gap: 12px; }
    .getting-started li { position: relative; padding-left: 32px; counter-increment: guide; }
    .getting-started li::before { content: counter(guide, decimal-leading-zero); position: absolute; left: 0; top: 1px; color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
    .getting-started strong { display: block; font-size: 12px; font-weight: 600; margin-bottom: 2px; }
    .getting-started p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
    .starter-label { font-size: 10px; color: var(--muted); font-weight: 500; margin: 0 0 10px; }
    .welcome-note { font-size: 11px; }
    .mode-help { font-size: 10px; color: var(--muted); margin: 8px 0 0; }
    .quick-caption, .proposal-summary, .checkpoint-empty, .notice { font-size: 12px; }
    .quick-title, .message-content { font-size: 13px; }
    @media (max-height: 600px) { .welcome { padding-top: 15px; } .getting-started { margin-bottom: 14px; } .topbar { padding-top: 10px; padding-bottom: 7px; } }
  </style>
</head>
<body>
  <main class="app" aria-label="${t('Asistente de programación Caled')}">
    <header class="topbar">
      <button id="studio" class="brand" title="${t('Mi estudio')}" aria-label="${t('Mi estudio')}">
        <svg class="brand-mark" viewBox="0 0 256 256" aria-hidden="true"><path d="M173 81a65 65 0 1 0 0 94" stroke-width="17"/><path d="M125 128h74m-24-24 24 24-24 24" stroke-width="17"/></svg>
        <span>caled</span>
      </button>
      <div class="top-actions">
        <button id="checkpoints" class="icon-button" aria-label="${t('Historial de cambios')}" title="${t('Historial de cambios')}" aria-controls="checkpoint-panel" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2"/></svg></button>
        <button id="clear" class="icon-button" aria-label="${t('Nueva conversación')}" title="${t('Nueva conversación')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
    </header>
    <nav class="preference-bar" aria-label="${t('Preferencias')}">
      <button id="preferences" class="text-button" title="${t('Idioma y apariencia')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z"/></svg>${t('Idioma y apariencia')}</button>
      <button id="account" class="text-button account"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>${t('Cuenta')}</button>
    </nav>
    <nav class="mode-bar" aria-label="${t('Modo del asistente')}">
      <button id="mode-chat" class="mode" aria-pressed="true" aria-describedby="mode-detail"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 1-8 8H4l1.5-4A8 8 0 1 1 20 11Z"/></svg>${t('Preguntar')}</button>
      <button id="mode-edit" class="mode" aria-pressed="false" aria-describedby="mode-detail"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6Z"/></svg>${t('Editar')}</button>
      <button id="mode-agent" class="mode" aria-pressed="false" aria-describedby="mode-detail"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v5H5zM14 14h5v5h-5zM15 5h4v4M19 5l-7 7M5 15v4h4"/></svg>${t('Agente')}</button>
      <span id="mode-detail" class="mode-detail">${t('Explora tu código')}</span>
    </nav>
    <section id="agent-profile" class="agent-profile" aria-label="${t('Perfil del agente')}" hidden>
      <button id="select-agent" class="agent-select" aria-label="${t('Elegir perfil del agente')}" aria-describedby="agent-description"><strong id="agent-label"></strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
      <p id="agent-description" class="agent-description"></p>
      <p class="mode-help">${t('Un agente a la vez. Cada cambio requiere tu aprobación.')}</p>
    </section>
    <div id="scroll" class="scroll" tabindex="0" aria-label="${t('Conversación')}">
      <details id="checkpoint-panel" class="checkpoint-panel" hidden><summary>${t('Historial de cambios')}</summary><div id="checkpoint-list"><p class="checkpoint-empty">${t('Cargando historial…')}</p></div></details>
      <section id="welcome" class="welcome" aria-label="${t('Empezar a trabajar')}">
        <div class="eyebrow">${t('De una idea a algo tuyo')}</div>
        <h1>${t('Haz espacio')}<br>${t('para tu idea.')}</h1>
        <p class="intro">${t('Cuéntanos qué quieres crear, con tus palabras. Caled te ayuda a entender y dar el siguiente paso.')}</p>
        <div id="project-entry" class="project-entry">
          <button id="open-folder" class="small-button primary">${t('Abrir un proyecto')}</button>
          <p>${t('Elige la carpeta donde guardarás tu trabajo.')}</p>
        </div>
        <details class="getting-started" open><summary>${t('Así empezamos')}</summary>
          <ol>
            <li><strong>${t('Describe')}</strong><p>${t('Escribe lo que quieres lograr. No necesitas conocer los términos técnicos.')}</p></li>
            <li><strong>${t('Revisa')}</strong><p>${t('Caled propone cambios. Tú decides cuáles aplicar.')}</p></li>
            <li><strong>${t('Comprueba')}</strong><p>${t('Observa el resultado, pregunta y mejora paso a paso.')}</p></li>
          </ol>
        </details>
        <h2 class="starter-label">${t('Prueba con una idea')}</h2>
        <div class="quick-list">
          <button class="quick" data-prompt="${t('Explica el código seleccionado y cómo encaja en este proyecto. Usa palabras sencillas y ejemplos.')}" data-mode="chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14"/></svg><span class="quick-copy"><span class="quick-title">${t('Entender mi proyecto')}</span><span class="quick-caption">${t('Una explicación sencilla de cómo funciona')}</span></span><span class="quick-arrow" aria-hidden="true">↗</span></button>
          <button class="quick" data-prompt="${t('Busca errores en el código seleccionado o en el proyecto. Señala problemas concretos y cómo resolverlos.')}" data-mode="chat"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7v4m0 2v.1"/></svg><span class="quick-copy"><span class="quick-title">${t('Encontrar un problema')}</span><span class="quick-caption">${t('Describe qué falla y te ayudamos a investigarlo')}</span></span><span class="quick-arrow" aria-hidden="true">↗</span></button>
          <button class="quick" data-prompt="${t('Quiero modificar ')}" data-mode="edit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 12h8M12 8v8"/></svg><span class="quick-copy"><span class="quick-title">${t('Dar forma a una idea')}</span><span class="quick-caption">${t('Propón un cambio y revísalo antes de aplicarlo')}</span></span><span class="quick-arrow" aria-hidden="true">↗</span></button>
          <button class="quick" data-prompt="${t('Investiga y resuelve esta tarea: ')}" data-mode="agent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6M5 21h14"/></svg><span class="quick-copy"><span class="quick-title">${t('Resolver una tarea')}</span><span class="quick-caption">${t('Un agente investiga, propone y comprueba contigo')}</span></span><span class="quick-arrow" aria-hidden="true">↗</span></button>
        </div>
        <p class="welcome-note">${t('Empieza con IA local, sin cuenta. Tú eliges el modelo y autorizas los cambios.')}</p>
      </section>
      <div id="conversation" class="conversation" aria-label="${t('Mensajes')}" role="log" aria-live="off"></div>
    </div>
    <section class="composer-area" aria-label="${t('Escribir una instrucción')}">
      <div id="trust-notice" class="trust-notice" hidden>${t('Para usar la IA con los archivos del proyecto, habilita la confianza del espacio de trabajo.')}</div>
      <div class="composer">
        <label for="prompt" class="sr-only">${t('Mensaje para Caled')}</label>
        <textarea id="prompt" rows="2" maxlength="16000" placeholder="${t('Pregunta sobre tu código…')}" spellcheck="true" aria-describedby="input-hint" disabled></textarea>
        <div class="composer-toolbar">
          <button id="model" class="model-button" title="${t('Elegir modelo')}" aria-label="${t('Elegir modelo de IA')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9"/></svg><span id="model-name" class="model-name">${t('Conectando…')}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button>
          <button id="configure" class="icon-button" aria-label="${t('Configurar proveedor de IA')}" title="${t('Configurar proveedor de IA')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg></button>
          <button id="send" class="send-button" aria-label="${t('Enviar mensaje')}" title="${t('Enviar mensaje (Enter)')}" disabled><svg id="send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg><svg id="cancel-icon" viewBox="0 0 24 24" aria-hidden="true" hidden><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>
        </div>
      </div>
      <div class="footer"><button id="reindex" class="context-button" title="${t('Volver a indexar los archivos del proyecto')}" aria-label="${t('Actualizar índice del proyecto')}"><span id="status-dot" class="status-dot" aria-hidden="true"></span><span id="context-label">${t('Cargando configuración…')}</span></button><span id="input-hint" class="keyboard-hint">${t('⇧ Enter · nueva línea')}</span></div>
    </section>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  </main>
  <script nonce="${nonce}">
  (function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const dictionary = ${dictionary};
    const locale = ${JSON.stringify(locale)};
    function t(text) { return Object.prototype.hasOwnProperty.call(dictionary, text) ? dictionary[text] : text; }
    const byId = function (id) { return document.getElementById(id); };
    const ui = { studio: byId('studio'), preferences: byId('preferences'), account: byId('account'), selectAgent: byId('select-agent'), openFolder: byId('open-folder'), agentProfile: byId('agent-profile'), scroll: byId('scroll'), welcome: byId('welcome'), conversation: byId('conversation'), prompt: byId('prompt'), send: byId('send'), model: byId('model'), clear: byId('clear'), configure: byId('configure'), reindex: byId('reindex'), chat: byId('mode-chat'), edit: byId('mode-edit'), agent: byId('mode-agent'), checkpoints: byId('checkpoints'), checkpointPanel: byId('checkpoint-panel'), checkpointList: byId('checkpoint-list'), announcer: byId('announcer') };
    let mode = 'chat';
    let busy = false;
    let cancelling = false;
    let initialized = false;
    let trusted = false;
    let indexedFiles = 0;
    let active = null;
    let stickToBottom = true;
    let history = [];
    const proposals = new Map();
    const approvals = new Map();
    const checkpoints = new Map();
    const rows = [];
    let timeline = null;
    let restoring = null;
    let followingFrame = false;
    const maxMessages = 40;
    const maxHistoryCharacters = 180000;
    const maxRows = 64;
    const maxVisibleCharacters = 280000;
    const maxSteps = 24;
    const maxCheckpoints = 30;

    function post(message) { vscode.postMessage(message); }
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (typeof text === 'string') node.textContent = text;
      return node;
    }
    function announce(text) { ui.announcer.textContent = text; }
    function follow() {
      if (!stickToBottom || followingFrame) return;
      followingFrame = true;
      requestAnimationFrame(function () { followingFrame = false; if (stickToBottom) ui.scroll.scrollTop = ui.scroll.scrollHeight; });
    }
    function resizeInput() { ui.prompt.style.height = 'auto'; ui.prompt.style.height = Math.min(ui.prompt.scrollHeight, 180) + 'px'; }
    function trimHistory() {
      let total = history.reduce(function (sum, item) { return sum + item.text.length; }, 0);
      while (history.length > maxMessages || total > maxHistoryCharacters) total -= history.shift().text.length;
    }
    function trimRows() {
      let total = rows.reduce(function (sum, row) { return sum + row.cost; }, 0);
      while (rows.length > maxRows || total > maxVisibleCharacters) {
        const index = rows.findIndex(function (row) { return !active || row.node !== active.wrapper; });
        if (index < 0) break;
        const row = rows.splice(index, 1)[0];
        total -= row.cost;
        row.node.remove();
        if (row.dispose) row.dispose();
      }
    }
    function appendRow(node, cost, dispose) {
      const row = { node: node, cost: cost, dispose: dispose };
      rows.push(row);
      ui.conversation.appendChild(node);
      trimRows();
      refreshWelcome();
      follow();
      return row;
    }
    function removeRow(node) {
      const index = rows.findIndex(function (row) { return row.node === node; });
      if (index >= 0) rows.splice(index, 1);
      node.remove();
    }
    function persist() {
      trimHistory();
      let remaining = maxHistoryCharacters;
      const messages = [];
      for (let i = history.length - 1; i >= 0 && messages.length < maxMessages; i--) {
        const item = history[i];
        if (item.text.length > remaining) break;
        messages.unshift({ role: item.role, text: item.text });
        remaining -= item.text.length;
      }
      vscode.setState({ version: 1, messages: messages, draft: ui.prompt.value.slice(0, 16000), mode: mode });
    }
    function refreshWelcome() { ui.welcome.hidden = ui.conversation.childElementCount > 0; }
    function updateControls() {
      ui.prompt.disabled = !initialized || !trusted;
      ui.send.disabled = busy ? cancelling : (!initialized || !trusted || !ui.prompt.value.trim());
      ui.send.classList.toggle('cancel', busy);
      ui.send.setAttribute('aria-label', busy ? (cancelling ? t('Cancelando respuesta') : t('Cancelar respuesta')) : t('Enviar mensaje'));
      ui.send.title = busy ? t('Cancelar respuesta') : t('Enviar mensaje (Enter)');
      byId('send-icon').toggleAttribute('hidden', busy);
      byId('cancel-icon').toggleAttribute('hidden', !busy);
      [ui.preferences, ui.account, ui.selectAgent, ui.openFolder, ui.model, ui.clear, ui.configure, ui.reindex, ui.chat, ui.edit, ui.agent, ui.checkpoints].forEach(function (button) { button.disabled = busy || restoring !== null; });
      ui.reindex.disabled = ui.reindex.disabled || !initialized || !trusted;
      ui.checkpoints.disabled = ui.checkpoints.disabled || !initialized || !trusted;
      document.querySelectorAll('.quick').forEach(function (button) { button.disabled = busy || restoring !== null || !initialized || !trusted; });
      proposals.forEach(function (proposal) { proposal.buttons.forEach(function (button) { button.disabled = !canUseProposal(proposal); }); });
      approvals.forEach(function (approval) { approval.buttons.forEach(function (button) { button.disabled = approval.finished || !busy || cancelling || !trusted; }); });
      checkpoints.forEach(function (checkpoint) { checkpoint.button.disabled = busy || restoring !== null || checkpoint.restored || !trusted; });
      ui.send.disabled = ui.send.disabled || restoring !== null;
      const awaiting = Array.from(approvals.values()).some(function (approval) { return !approval.finished; }) || Array.from(proposals.values()).some(function (proposal) { return proposal.awaitingApproval && !proposal.finished && !proposal.pending; });
      byId('status-dot').className = 'status-dot' + (busy ? ' busy' : indexedFiles > 0 ? ' ready' : '');
      byId('context-label').textContent = busy ? (cancelling ? t('Cancelando…') : awaiting ? t('Esperando tu autorización…') : t('Trabajando en tu solicitud…')) : restoring !== null ? t('Restaurando archivos…') : !initialized ? t('Cargando configuración…') : !trusted ? t('Espacio de trabajo sin confianza') : indexedFiles > 0 ? indexedFiles + (indexedFiles === 1 ? t(' archivo en contexto') : t(' archivos en contexto')) : t('Sin archivos indexados');
      byId('trust-notice').hidden = !initialized || trusted;
    }
    function setBusy(value) { busy = value; if (!value) { cancelling = false; expireApprovals(); expireAgentProposals(); } updateControls(); }
    function setMode(value) {
      mode = value === 'edit' || value === 'agent' ? value : 'chat';
      ui.agentProfile.hidden = mode !== 'agent';
      ui.chat.setAttribute('aria-pressed', String(mode === 'chat'));
      ui.edit.setAttribute('aria-pressed', String(mode === 'edit'));
      ui.agent.setAttribute('aria-pressed', String(mode === 'agent'));
      byId('mode-detail').textContent = mode === 'agent' ? t('Investiga, edita y verifica') : mode === 'edit' ? t('Revisa antes de aplicar') : t('Explora tu código');
      ui.prompt.placeholder = mode === 'agent' ? t('Describe la tarea que quieres resolver…') : mode === 'edit' ? t('Describe el cambio que quieres hacer…') : t('Pregunta sobre tu código…');
    }
    function formatCompletedContent(container, text) {
      // Only text nodes are created from model output, including fenced code.
      container.replaceChildren();
      const lines = text.split('\\n');
      let code = false;
      let language = '';
      let buffer = [];
      let blocks = 0;
      function flush() {
        if (!buffer.length) return;
        blocks++;
        if (code) {
          const block = element('div', 'code-block');
          if (language) block.appendChild(element('div', 'code-language', language.slice(0, 60)));
          const pre = element('pre');
          pre.appendChild(element('code', '', buffer.join('\\n')));
          block.appendChild(pre);
          container.appendChild(block);
        } else {
          container.appendChild(element('div', 'prose', buffer.join('\\n')));
        }
        buffer = [];
      }
      for (const line of lines) {
        const fence = line.match(/^\\s*\x60\x60\x60([^\x60]*)$/);
        if (fence && blocks < 150) { flush(); code = !code; language = code ? fence[1].trim() : ''; }
        else buffer.push(line);
      }
      flush();
    }
    function appendMessage(role, text, remember) {
      if (text.length > maxHistoryCharacters) text = text.slice(0, maxHistoryCharacters - 60) + '\\n' + t('[Respuesta recortada por el límite de visualización]');
      const wrapper = element('article', 'message ' + role);
      const label = element('div', 'message-label');
      label.appendChild(element('span', 'avatar', role === 'user' ? t('Tú').slice(0, 1) : 'C'));
      label.appendChild(element('span', '', role === 'user' ? t('Tú') : 'Caled'));
      wrapper.appendChild(label);
      const content = element('div', 'message-content', text);
      wrapper.appendChild(content);
      const item = { role: role, text: text };
      if (remember) { history.push(item); trimHistory(); }
      if (role === 'assistant' && text) formatCompletedContent(content, text);
      const row = appendRow(wrapper, text.length);
      return { wrapper: wrapper, content: content, item: item, row: row };
    }
    function finishActive() {
      if (active) {
        const truncated = active.truncated;
        active.wrapper.classList.remove('streaming');
        if (active.item.text) formatCompletedContent(active.content, active.item.text);
        else { removeRow(active.wrapper); history = history.filter(function (item) { return item !== active.item; }); }
        active = null;
        if (truncated) notice(t('Respuesta recortada por el límite de visualización. Divide la solicitud en partes más pequeñas.'), false);
      }
    }
    function finishResponse() {
      finishActive();
      expireAgentProposals();
      if (timeline) timeline.steps.forEach(function (step) {
        if (step.status === 'running') { step.status = 'error'; step.label.textContent = t('Interrumpido'); step.node.setAttribute('data-status', 'error'); }
      });
      setBusy(false);
      persist();
      refreshWelcome();
      follow();
    }
    function notice(text, isError) {
      text = text.slice(0, 16000);
      const node = element('div', 'notice' + (isError ? ' error' : ''), text);
      node.setAttribute('role', isError ? 'alert' : 'status');
      appendRow(node, text.length);
    }
    function send() {
      if (busy || restoring !== null || !trusted || !initialized) return;
      const text = ui.prompt.value.trim();
      if (!text) return;
      if (text.length > 16000) { notice(t('La solicitud debe tener como máximo 16.000 caracteres.'), true); return; }
      stickToBottom = true;
      appendMessage('user', text, true);
      ui.prompt.value = '';
      resizeInput();
      setBusy(true);
      persist();
      post({ type: 'send', text: text, mode: mode });
      announce(t('Solicitud enviada. Caled está trabajando.'));
    }
    function finishProposal(proposal, label) {
      if (proposal.finished) return;
      proposal.finished = true;
      proposal.actions.hidden = true;
      proposal.card.appendChild(element('div', 'proposal-result', label));
      updateControls();
      announce(label);
    }
    function addProposal(message) {
      if (proposals.has(message.id)) return;
      const awaitingApproval = message.awaitingApproval === true;
      if (awaitingApproval && (!busy || cancelling || !trusted)) return;
      const card = element('section', 'proposal');
      card.setAttribute('aria-label', t('Cambios propuestos'));
      const main = element('div', 'proposal-main');
      main.appendChild(element('h2', 'proposal-heading', t('Cambios listos para revisar')));
      main.appendChild(element('p', 'proposal-summary', message.summary.slice(0, 8000)));
      const files = element('ul', 'proposal-files');
      message.files.slice(0, 100).forEach(function (file) { if (typeof file === 'string') files.appendChild(element('li', '', file.slice(0, 1000))); });
      main.appendChild(files);
      card.appendChild(main);
      const actions = element('div', 'proposal-actions');
      card.appendChild(actions);
      const proposal = { card: card, actions: actions, buttons: [], pending: false, finished: false, awaitingApproval: awaitingApproval };
      [['review', t('Ver diferencias'), false], ['apply', t('Aplicar cambios'), true], ['discard', t('Descartar'), false]].forEach(function (action) {
        const button = element('button', 'small-button' + (action[2] ? ' primary' : ''), action[1]);
        button.addEventListener('click', function () {
          if (!canUseProposal(proposal)) return;
          if (action[0] === 'apply') { proposal.pending = true; button.textContent = t('Aplicando…'); updateControls(); }
          if (action[0] === 'discard') finishProposal(proposal, t('Propuesta descartada.'));
          post({ type: action[0], id: message.id });
        });
        proposal.buttons.push(button);
        actions.appendChild(button);
      });
      proposals.set(message.id, proposal);
      appendRow(card, main.textContent.length, function () {
        if (proposal.awaitingApproval && !proposal.finished && !proposal.pending) post({ type: 'discard', id: message.id });
        proposal.finished = true;
        proposal.buttons.forEach(function (button) { button.disabled = true; });
        proposals.delete(message.id);
      });
      updateControls();
      follow();
      announce(t('Propuesta preparada. Puedes revisar las diferencias antes de aplicar los cambios.'));
    }
    function canUseProposal(proposal) {
      return initialized && trusted && !cancelling && restoring === null && (!busy || proposal.awaitingApproval) && !proposal.pending && !proposal.finished;
    }
    function expireAgentProposals() {
      proposals.forEach(function (proposal) { if (proposal.awaitingApproval && !proposal.finished) finishProposal(proposal, t('Propuesta caducada. Vuelve a solicitar el cambio.')); });
    }
    function finishApproval(approval, label) {
      if (approval.finished) return;
      approval.finished = true;
      approval.buttons.forEach(function (button) { button.disabled = true; });
      approval.actions.hidden = true;
      approval.card.appendChild(element('div', 'proposal-result', label));
      announce(label);
    }
    function expireApprovals() {
      approvals.forEach(function (approval) { finishApproval(approval, t('Solicitud de ejecución caducada.')); });
    }
    function addApproval(message) {
      if (approvals.has(message.id) || !busy || cancelling || !trusted) return;
      // Commands and their working directory are always shown verbatim: no truncation or HTML.
      if (message.command.length > 32000 || message.cwd.length > 8000) { post({ type: 'approve', id: message.id, allow: false }); notice(t('El comando supera el límite de visualización y se rechazó.'), true); return; }
      const card = element('section', 'proposal approval');
      card.setAttribute('aria-label', t('Autorizar ejecución de comando'));
      const main = element('div', 'proposal-main');
      main.appendChild(element('h2', 'proposal-heading', t('El agente quiere ejecutar un comando')));
      main.appendChild(element('p', 'proposal-summary', t('Se ejecutará una vez con tus permisos de usuario. Puede afectar archivos fuera de esta carpeta.')));
      main.appendChild(element('div', 'approval-location', t('Carpeta: ') + message.cwd));
      const command = element('pre');
      command.appendChild(element('code', '', message.command));
      main.appendChild(command);
      card.appendChild(main);
      const actions = element('div', 'proposal-actions');
      card.appendChild(actions);
      const approval = { card: card, actions: actions, buttons: [], finished: false };
      [[true, t('Autorizar una vez')], [false, t('Rechazar')]].forEach(function (choice) {
        const button = element('button', 'small-button' + (choice[0] ? ' primary' : ''), choice[1]);
        button.addEventListener('click', function () {
          if (approval.finished || !busy || cancelling || !trusted) return;
          finishApproval(approval, choice[0] ? t('Ejecución autorizada una vez.') : t('Ejecución rechazada.'));
          post({ type: 'approve', id: message.id, allow: choice[0] });
          updateControls();
        });
        approval.buttons.push(button);
        actions.appendChild(button);
      });
      approvals.set(message.id, approval);
      appendRow(card, main.textContent.length, function () {
        if (!approval.finished) { finishApproval(approval, t('Solicitud caducada.')); post({ type: 'approve', id: message.id, allow: false }); }
        approvals.delete(message.id);
      });
      updateControls();
      announce(t('El agente espera autorización para ejecutar un comando. Revisa el comando y su carpeta en la conversación.'));
    }
    function addAgentStep(message) {
      if (!busy || cancelling) return;
      if (!timeline) {
        const card = element('section', 'timeline');
        card.setAttribute('aria-label', t('Actividad del agente'));
        card.appendChild(element('h2', 'timeline-heading', t('Actividad del agente')));
        const list = element('ol', 'steps');
        card.appendChild(list);
        const current = { card: card, list: list, steps: new Map(), row: null };
        timeline = current;
        current.row = appendRow(card, 0, function () { if (timeline === current) timeline = null; current.steps.clear(); });
      }
      let step = timeline.steps.get(message.step);
      if (!step) {
        const node = element('li', 'step');
        const heading = element('div', 'step-heading');
        const action = element('span');
        const label = element('span', 'step-status');
        heading.appendChild(action);
        heading.appendChild(label);
        node.appendChild(heading);
        const details = element('details');
        details.appendChild(element('summary', '', t('Ver detalles')));
        const detail = element('pre');
        details.appendChild(detail);
        node.appendChild(details);
        timeline.list.appendChild(node);
        step = { node: node, action: action, label: label, details: details, detail: detail, status: message.status };
        timeline.steps.set(message.step, step);
        while (timeline.steps.size > maxSteps) {
          const key = timeline.steps.keys().next().value;
          timeline.steps.get(key).node.remove();
          timeline.steps.delete(key);
        }
      }
      step.status = message.status;
      step.node.setAttribute('data-status', message.status);
      const labels = new Map([['plan', t('Planificar siguiente paso')], ['list', t('Explorar archivos')], ['read', t('Leer archivo')], ['search', t('Buscar en el proyecto')], ['diagnostics', t('Revisar diagnósticos')], ['edit', t('Preparar cambios')], ['terminal', t('Ejecutar comando')], ['finish', t('Resultado')]]);
      step.action.textContent = message.step + '. ' + (labels.get(message.action) || message.action.slice(0, 300));
      step.label.textContent = message.status === 'running' ? t('En curso') : message.status === 'done' ? t('Completado') : t('Error');
      if (typeof message.detail === 'string') step.detail.textContent = message.detail.length > 8000 ? message.detail.slice(0, 8000) + '\\n' + t('[Detalle recortado]') : message.detail;
      step.details.hidden = !step.detail.textContent;
      timeline.row.cost = timeline.card.textContent.length;
      trimRows();
      follow();
      if (message.status !== 'running') announce(step.action.textContent + ': ' + step.label.textContent + '.');
    }
    function showCheckpoints(items) {
      checkpoints.clear();
      ui.checkpointList.replaceChildren();
      const valid = items.filter(function (item) { return item && typeof item.id === 'string' && item.id.length <= 200 && typeof item.summary === 'string' && Array.isArray(item.files) && (typeof item.createdAt === 'string' || typeof item.createdAt === 'number'); }).slice(0, maxCheckpoints);
      valid.forEach(function (item) {
        if (checkpoints.has(item.id)) return;
        const card = element('article', 'checkpoint');
        card.appendChild(element('p', 'checkpoint-title', item.summary.slice(0, 2000)));
        const date = new Date(item.createdAt);
        card.appendChild(element('time', 'checkpoint-time', Number.isNaN(date.getTime()) ? t('Fecha no disponible') : date.toLocaleString(locale)));
        const files = element('details');
        files.appendChild(element('summary', '', item.files.length + (item.files.length === 1 ? t(' archivo') : t(' archivos'))));
        const list = element('ul', 'proposal-files');
        item.files.slice(0, 100).forEach(function (file) { if (typeof file === 'string') list.appendChild(element('li', '', file.slice(0, 1000))); });
        files.appendChild(list);
        card.appendChild(files);
        const button = element('button', 'small-button', t('Restaurar archivos'));
        button.setAttribute('aria-label', t('Restaurar archivos: ') + item.summary.slice(0, 200));
        const checkpoint = { button: button, restored: false };
        button.addEventListener('click', function () {
          if (busy || restoring !== null || !trusted || checkpoint.restored || checkpoints.get(item.id) !== checkpoint) return;
          restoring = item.id;
          button.textContent = t('Restaurando…');
          updateControls();
          post({ type: 'restoreCheckpoint', id: item.id });
        });
        card.appendChild(button);
        checkpoints.set(item.id, checkpoint);
        ui.checkpointList.appendChild(card);
      });
      if (!checkpoints.size) ui.checkpointList.appendChild(element('p', 'checkpoint-empty', t('Los cambios aplicados aparecerán aquí para que puedas restaurarlos.')));
      updateControls();
    }

    ui.scroll.addEventListener('scroll', function () { stickToBottom = ui.scroll.scrollHeight - ui.scroll.scrollTop - ui.scroll.clientHeight < 70; });
    ui.prompt.addEventListener('input', function () { resizeInput(); updateControls(); persist(); });
    ui.studio.addEventListener('click', function () { post({ type: 'home' }); });
    ui.prompt.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
    });
    ui.send.addEventListener('click', function () {
      if (busy) { if (cancelling) return; cancelling = true; expireApprovals(); expireAgentProposals(); updateControls(); post({ type: 'cancel' }); }
      else send();
    });
    ui.chat.addEventListener('click', function () { if (!busy) setMode('chat'); });
    ui.edit.addEventListener('click', function () { if (!busy) setMode('edit'); });
    ui.agent.addEventListener('click', function () { if (!busy) setMode('agent'); });
    const modes = [ui.chat, ui.edit, ui.agent];
    modes.forEach(function (button, index) {
      button.addEventListener('keydown', function (event) {
        if (busy || restoring !== null) return;
        const next = event.key === 'ArrowRight' ? (index + 1) % modes.length : event.key === 'ArrowLeft' ? (index + modes.length - 1) % modes.length : event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        setMode(['chat', 'edit', 'agent'][next]);
        modes[next].focus();
      });
    });
    ui.checkpoints.addEventListener('click', function () {
      if (busy || restoring !== null || !initialized || !trusted) return;
      ui.checkpointPanel.hidden = false;
      ui.checkpointPanel.open = !ui.checkpointPanel.open;
      ui.checkpoints.setAttribute('aria-expanded', String(ui.checkpointPanel.open));
      if (ui.checkpointPanel.open) { post({ type: 'listCheckpoints' }); ui.scroll.scrollTop = 0; stickToBottom = false; }
    });
    ui.checkpointPanel.addEventListener('toggle', function () { ui.checkpoints.setAttribute('aria-expanded', String(ui.checkpointPanel.open)); });
    [[ui.preferences, 'preferences'], [ui.account, 'account'], [ui.selectAgent, 'selectAgent'], [ui.openFolder, 'openFolder'], [ui.configure, 'configure'], [ui.model, 'selectModel'], [ui.reindex, 'reindex'], [ui.clear, 'clear']].forEach(function (entry) {
      let pending = false;
      entry[0].addEventListener('click', function () {
        if (busy || restoring !== null || pending || (entry[1] === 'reindex' && (!initialized || !trusted))) return;
        pending = true;
        post({ type: entry[1] });
        setTimeout(function () { pending = false; }, 600);
      });
    });
    document.querySelectorAll('.quick').forEach(function (button) {
      button.addEventListener('click', function () {
        if (busy || restoring !== null || !initialized || !trusted) return;
        setMode(button.dataset.mode);
        ui.prompt.value = button.dataset.prompt || '';
        resizeInput();
        updateControls();
        ui.prompt.focus();
      });
    });
    window.addEventListener('message', function (event) {
      const message = event.data;
      if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
      switch (message.type) {
        case 'draft': {
          if (busy || restoring !== null || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 16000 || !['chat', 'edit', 'agent'].includes(message.mode)) break;
          const useDraft = function () {
            if (busy || restoring !== null) return;
            setMode(message.mode); ui.prompt.value = message.text;
            resizeInput(); updateControls(); persist(); ui.prompt.focus();
            announce(t('Instrucción preparada. Revísala antes de enviarla.'));
          };
          if (!ui.prompt.value.trim()) useDraft();
          else {
            const card = element('section', 'proposal');
            card.appendChild(element('p', 'proposal-summary', t('Tu borrador se conserva. Hay una nueva instrucción del cuaderno lista para revisar.')));
            card.appendChild(element('pre', 'message-content', message.text));
            const button = element('button', 'small-button', t('Usar esta instrucción'));
            button.addEventListener('click', function () { if (!busy && restoring === null) { useDraft(); button.disabled = true; } });
            card.appendChild(button); appendRow(card, message.text.length);
          }
          break;
        }
        case 'selectMode':
          if (!busy && ['chat', 'edit', 'agent'].includes(message.mode)) setMode(message.mode);
          break;
        case 'user':
          if (typeof message.text === 'string') appendMessage('user', message.text, true);
          break;
        case 'state':
          initialized = true;
          byId('project-entry').hidden = message.hasWorkspace === true;
          byId('agent-label').textContent = typeof message.agentLabel === 'string' ? message.agentLabel.slice(0, 100) : t('Agente');
          byId('agent-description').textContent = typeof message.agentDescription === 'string' ? message.agentDescription.slice(0, 1000) : t('Un agente a la vez. Cada cambio requiere tu aprobación.');
          trusted = message.trusted === true;
          indexedFiles = Number.isFinite(message.indexedFiles) ? Math.max(0, Math.floor(message.indexedFiles)) : 0;
          byId('model-name').textContent = typeof message.model === 'string' && message.model ? message.model : t('Elegir modelo');
          ui.model.title = (typeof message.provider === 'string' ? message.provider + ' · ' : '') + t('Elegir modelo');
          if (!trusted) { expireApprovals(); expireAgentProposals(); }
          setBusy(message.busy === true);
          break;
        case 'start':
          finishActive();
          expireApprovals();
          expireAgentProposals();
          timeline = null;
          setMode(message.mode);
          if (mode !== 'agent') { active = appendMessage('assistant', '', true); active.wrapper.classList.add('streaming'); }
          setBusy(true);
          break;
        case 'delta':
          if (typeof message.text !== 'string' || mode === 'agent' || cancelling) break;
          if (!active) { active = appendMessage('assistant', '', true); active.wrapper.classList.add('streaming'); setBusy(true); }
          { const chunk = message.text.slice(0, Math.max(0, maxHistoryCharacters - active.item.text.length));
            if (chunk.length < message.text.length) active.truncated = true;
            active.item.text += chunk;
            if (!active.content.firstChild) active.content.appendChild(document.createTextNode(chunk));
            else active.content.firstChild.appendData(chunk);
            active.row.cost = active.item.text.length;
            trimRows();
            trimHistory();
          }
          follow();
          break;
        case 'agentStep':
          if (Number.isSafeInteger(message.step) && message.step > 0 && typeof message.action === 'string' && ['running', 'done', 'error'].includes(message.status)) addAgentStep(message);
          break;
        case 'agentResult':
          if (typeof message.text === 'string' && busy && !cancelling) { finishActive(); appendMessage('assistant', message.text, true); persist(); }
          break;
        case 'approval':
          if (typeof message.id === 'string' && message.id.length <= 200 && typeof message.command === 'string' && typeof message.cwd === 'string') addApproval(message);
          break;
        case 'checkpoints':
          if (Array.isArray(message.items)) {
            showCheckpoints(message.items);
            if (message.show === true) { ui.checkpointPanel.hidden = false; ui.checkpointPanel.open = true; ui.checkpoints.setAttribute('aria-expanded', 'true'); ui.scroll.scrollTop = 0; stickToBottom = false; }
          }
          break;
        case 'restored': {
          const checkpoint = checkpoints.get(message.id);
          if (checkpoint) { checkpoint.restored = true; checkpoint.button.textContent = t('Archivos restaurados'); }
          if (restoring === message.id) restoring = null;
          updateControls();
          notice(t('Archivos restaurados desde el historial de cambios.'), false);
          break;
        }
        case 'done':
          finishResponse();
          announce(t('Respuesta completada.'));
          break;
        case 'error':
          if (message.recoverable !== true) finishResponse();
          restoring = null;
          checkpoints.forEach(function (checkpoint) { if (!checkpoint.restored) checkpoint.button.textContent = t('Restaurar archivos'); });
          proposals.forEach(function (proposal) { if (proposal.pending && !proposal.finished) { proposal.pending = false; proposal.buttons[1].textContent = t('Aplicar cambios'); } });
          updateControls();
          notice(typeof message.message === 'string' ? message.message : t('No se pudo completar la solicitud.'), true);
          break;
        case 'notice':
          if (typeof message.message === 'string') notice(message.message, false);
          break;
        case 'proposal':
          if (typeof message.id === 'string' && message.id.length <= 200 && typeof message.summary === 'string' && Array.isArray(message.files)) addProposal(message);
          break;
        case 'proposalExpired': {
          const proposal = proposals.get(message.id);
          if (proposal) finishProposal(proposal, t('Propuesta caducada. Vuelve a solicitar el cambio.'));
          const approval = approvals.get(message.id);
          if (approval) finishApproval(approval, t('Solicitud de ejecución caducada.'));
          break;
        }
        case 'applied': {
          const proposal = proposals.get(message.id);
          if (proposal && !proposal.finished) finishProposal(proposal, t('Cambios aplicados en el proyecto.'));
          break;
        }
        case 'cleared':
          if (message.resetDraft === true) { ui.prompt.value = ''; setMode('chat'); resizeInput(); }
          expireApprovals();
          proposals.forEach(function (proposal) { proposal.finished = true; proposal.buttons.forEach(function (button) { button.disabled = true; }); });
          active = null;
          timeline = null;
          history = [];
          rows.length = 0;
          proposals.clear();
          approvals.clear();
          ui.conversation.replaceChildren();
          setBusy(false);
          persist();
          refreshWelcome();
          announce(t('Nueva conversación.'));
          ui.scroll.scrollTop = 0; stickToBottom = false;
          ui.prompt.focus();
          break;
      }
    });
    const saved = vscode.getState();
    if (saved && saved.version === 1) {
      if (typeof saved.draft === 'string' && saved.draft.length <= 16000) ui.prompt.value = saved.draft;
      if (['chat', 'edit', 'agent'].includes(saved.mode)) setMode(saved.mode);
      resizeInput();
    }
    if (saved && saved.version === 1 && Array.isArray(saved.messages)) {
      let restoredCharacters = 0;
      for (const message of saved.messages.slice(-maxMessages)) {
        if (!message || (message.role !== 'user' && message.role !== 'assistant') || typeof message.text !== 'string') continue;
        restoredCharacters += message.text.length;
        if (restoredCharacters > maxHistoryCharacters) break;
        appendMessage(message.role, message.text, true);
      }
    }
    updateControls();
    post({ type: 'ready' });
  })();
  </script>
</body>
</html>`;
}
