export type AppLanguage = 'es' | 'en';
export type AgentProfileId = 'guide' | 'builder' | 'fixer' | 'reviewer' | 'tester';
export interface AgentProfile {
  id: AgentProfileId;
  name: Record<AppLanguage, string>;
  description: Record<AppLanguage, string>;
  canEdit: boolean;
  canRunCommands: boolean;
  instruction: string;
}

// Profiles are curated capabilities, not simultaneous background model instances.
// The engine enforces capabilities before calling any tool, independent of prompts.
export const AGENT_PROFILES: readonly AgentProfile[] = Object.freeze([
  { id: 'guide', name: { es: 'Guía', en: 'Guide' }, description: { es: 'Explica el proyecto y prepara un plan. Solo lee; no modifica ni ejecuta.', en: 'Explains your project and prepares a plan. Reads only; no edits or commands.' }, canEdit: false, canRunCommands: false, instruction: 'Teach a beginner. Explain unfamiliar terms with a concrete example. Read relevant files and finish with small next steps. You cannot edit or execute commands.' },
  { id: 'builder', name: { es: 'Constructor', en: 'Builder' }, description: { es: 'Convierte una idea en cambios pequeños que puedes revisar y probar.', en: 'Turns an idea into small changes you can review and test.' }, canEdit: true, canRunCommands: true, instruction: 'Implement the requested feature with minimal coherent edits. Describe the visible outcome in plain language. Read existing code first, preserve conventions and verify results. Never claim a feature works merely because it was written.' },
  { id: 'fixer', name: { es: 'Reparador', en: 'Fixer' }, description: { es: 'Investiga un error, corrige su causa y comprueba el resultado.', en: 'Investigates an error, fixes its cause and checks the result.' }, canEdit: true, canRunCommands: true, instruction: 'Diagnose from evidence before editing. Read the failing path and diagnostics. Make the smallest correction, then run a relevant approved check. Explain the cause and observed result; do not refactor unrelated code.' },
  { id: 'reviewer', name: { es: 'Revisor', en: 'Reviewer' }, description: { es: 'Busca fallos y explica su impacto. Solo lee; conserva tus archivos.', en: 'Finds bugs and explains their impact. Reads only; preserves your files.' }, canEdit: false, canRunCommands: false, instruction: 'Review actual code for concrete reproducible defects. Prioritize correctness, data loss and security. Cite paths and lines with reasoning. Mark uncertainty clearly; do not invent findings. You cannot edit or execute commands.' },
  { id: 'tester', name: { es: 'Verificador', en: 'Tester' }, description: { es: 'Revisa diagnósticos y ejecuta comprobaciones que tú autorizas.', en: 'Reviews diagnostics and runs checks you approve.' }, canEdit: false, canRunCommands: true, instruction: 'Inspect the project test setup and run relevant checks only with approval. Report actual exit codes, failures and coverage limitations. Do not edit source files. Shell commands may have side effects: explain their exact purpose.' },
].map(profile => Object.freeze(profile)) as AgentProfile[]);

export function getAgentProfile(id: string): AgentProfile {
  const profile = AGENT_PROFILES.find(profile => profile.id === id);
  if (!profile) throw new Error('Unknown agent profile. Choose one of the available profiles.');
  return profile;
}
