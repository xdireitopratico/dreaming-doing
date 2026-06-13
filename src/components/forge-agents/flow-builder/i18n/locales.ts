/**
 * AetherForge Builder i18n — Locale definitions
 * Rodada 30: Multi-Language + i18n
 */

export type Locale = "pt-BR" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  "pt-BR": "Português (BR)",
  en: "English",
  es: "Español",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  "pt-BR": "🇧🇷",
  en: "🇺🇸",
  es: "🇪🇸",
};

type TranslationKeys = {
  // Toolbar
  save: string;
  publish: string;
  undo: string;
  redo: string;
  test: string;
  deploy: string;
  logs: string;
  eval: string;
  tools: string;
  validation: string;
  rag: string;
  templates: string;
  hooks: string;
  versions: string;
  analytics: string;
  team: string;
  schedules: string;
  market: string;
  secrets: string;
  notifications: string;
  debug: string;
  comments: string;
  backup: string;
  // Panels
  testPanel: string;
  deployPanel: string;
  logsPanel: string;
  evalPanel: string;
  validationPanel: string;
  // Flow canvas
  addNode: string;
  deleteNode: string;
  duplicateNode: string;
  connectNodes: string;
  // Node types
  nodeTrigger: string;
  nodeLLM: string;
  nodeSTT: string;
  nodeTTS: string;
  nodeTool: string;
  nodeCondition: string;
  nodeLoop: string;
  nodeHITL: string;
  nodeSubFlow: string;
  nodeOutputGuard: string;
  nodeRAGSearch: string;
  nodeMemory: string;
  nodeTransformer: string;
  nodeDelay: string;
  nodeSwitch: string;
  nodeErrorHandler: string;
  // Common
  close: string;
  cancel: string;
  confirm: string;
  search: string;
  loading: string;
  noResults: string;
  error: string;
  success: string;
  warning: string;
  // Export/Import
  exportBackup: string;
  importBackup: string;
  backupValid: string;
  backupInvalid: string;
  exporting: string;
  importing: string;
  // Agent settings
  agentLanguage: string;
  autoDetectLanguage: string;
  primaryLanguage: string;
  supportedLanguages: string;
  // Command palette
  commandPalette: string;
  typeCommand: string;
};

const ptBR: TranslationKeys = {
  save: "Salvar",
  publish: "Publicar",
  undo: "Desfazer",
  redo: "Refazer",
  test: "Testar",
  deploy: "Deploy",
  logs: "Logs",
  eval: "Avaliação",
  tools: "Tools",
  validation: "Validação",
  rag: "RAG",
  templates: "Templates",
  hooks: "Hooks",
  versions: "Versões",
  analytics: "Analytics",
  team: "Time",
  schedules: "Agendamentos",
  market: "Marketplace",
  secrets: "Secrets",
  notifications: "Notificações",
  debug: "Debug",
  comments: "Comentários",
  backup: "Backup",
  testPanel: "Painel de Teste",
  deployPanel: "Painel de Deploy",
  logsPanel: "Logs de Execução",
  evalPanel: "Avaliação",
  validationPanel: "Validação do Flow",
  addNode: "Adicionar nó",
  deleteNode: "Remover nó",
  duplicateNode: "Duplicar nó",
  connectNodes: "Conectar nós",
  nodeTrigger: "Gatilho",
  nodeLLM: "LLM",
  nodeSTT: "Fala → Texto",
  nodeTTS: "Texto → Fala",
  nodeTool: "Ferramenta",
  nodeCondition: "Condição",
  nodeLoop: "Loop",
  nodeHITL: "Human-in-the-Loop",
  nodeSubFlow: "Sub-Flow",
  nodeOutputGuard: "Guardrail de Saída",
  nodeRAGSearch: "Busca RAG",
  nodeMemory: "Memória",
  nodeTransformer: "Transformador",
  nodeDelay: "Delay",
  nodeSwitch: "Switch",
  nodeErrorHandler: "Tratamento de Erro",
  close: "Fechar",
  cancel: "Cancelar",
  confirm: "Confirmar",
  search: "Buscar",
  loading: "Carregando...",
  noResults: "Nenhum resultado",
  error: "Erro",
  success: "Sucesso",
  warning: "Aviso",
  exportBackup: "Exportar Backup",
  importBackup: "Importar Backup",
  backupValid: "Backup válido",
  backupInvalid: "Backup inválido",
  exporting: "Exportando...",
  importing: "Importando...",
  agentLanguage: "Idioma do Agente",
  autoDetectLanguage: "Detectar idioma automaticamente",
  primaryLanguage: "Idioma principal",
  supportedLanguages: "Idiomas suportados",
  commandPalette: "Paleta de Comandos",
  typeCommand: "Digite um comando...",
};

const en: TranslationKeys = {
  save: "Save",
  publish: "Publish",
  undo: "Undo",
  redo: "Redo",
  test: "Test",
  deploy: "Deploy",
  logs: "Logs",
  eval: "Evaluation",
  tools: "Tools",
  validation: "Validation",
  rag: "RAG",
  templates: "Templates",
  hooks: "Hooks",
  versions: "Versions",
  analytics: "Analytics",
  team: "Team",
  schedules: "Schedules",
  market: "Marketplace",
  secrets: "Secrets",
  notifications: "Notifications",
  debug: "Debug",
  comments: "Comments",
  backup: "Backup",
  testPanel: "Test Panel",
  deployPanel: "Deploy Panel",
  logsPanel: "Execution Logs",
  evalPanel: "Evaluation",
  validationPanel: "Flow Validation",
  addNode: "Add node",
  deleteNode: "Delete node",
  duplicateNode: "Duplicate node",
  connectNodes: "Connect nodes",
  nodeTrigger: "Trigger",
  nodeLLM: "LLM",
  nodeSTT: "Speech → Text",
  nodeTTS: "Text → Speech",
  nodeTool: "Tool",
  nodeCondition: "Condition",
  nodeLoop: "Loop",
  nodeHITL: "Human-in-the-Loop",
  nodeSubFlow: "Sub-Flow",
  nodeOutputGuard: "Output Guard",
  nodeRAGSearch: "RAG Search",
  nodeMemory: "Memory",
  nodeTransformer: "Transformer",
  nodeDelay: "Delay",
  nodeSwitch: "Switch",
  nodeErrorHandler: "Error Handler",
  close: "Close",
  cancel: "Cancel",
  confirm: "Confirm",
  search: "Search",
  loading: "Loading...",
  noResults: "No results",
  error: "Error",
  success: "Success",
  warning: "Warning",
  exportBackup: "Export Backup",
  importBackup: "Import Backup",
  backupValid: "Valid backup",
  backupInvalid: "Invalid backup",
  exporting: "Exporting...",
  importing: "Importing...",
  agentLanguage: "Agent Language",
  autoDetectLanguage: "Auto-detect language",
  primaryLanguage: "Primary language",
  supportedLanguages: "Supported languages",
  commandPalette: "Command Palette",
  typeCommand: "Type a command...",
};

const es: TranslationKeys = {
  save: "Guardar",
  publish: "Publicar",
  undo: "Deshacer",
  redo: "Rehacer",
  test: "Probar",
  deploy: "Deploy",
  logs: "Logs",
  eval: "Evaluación",
  tools: "Tools",
  validation: "Validación",
  rag: "RAG",
  templates: "Plantillas",
  hooks: "Hooks",
  versions: "Versiones",
  analytics: "Analytics",
  team: "Equipo",
  schedules: "Programaciones",
  market: "Marketplace",
  secrets: "Secrets",
  notifications: "Notificaciones",
  debug: "Debug",
  comments: "Comentarios",
  backup: "Backup",
  testPanel: "Panel de Pruebas",
  deployPanel: "Panel de Deploy",
  logsPanel: "Logs de Ejecución",
  evalPanel: "Evaluación",
  validationPanel: "Validación del Flow",
  addNode: "Agregar nodo",
  deleteNode: "Eliminar nodo",
  duplicateNode: "Duplicar nodo",
  connectNodes: "Conectar nodos",
  nodeTrigger: "Disparador",
  nodeLLM: "LLM",
  nodeSTT: "Voz → Texto",
  nodeTTS: "Texto → Voz",
  nodeTool: "Herramienta",
  nodeCondition: "Condición",
  nodeLoop: "Bucle",
  nodeHITL: "Human-in-the-Loop",
  nodeSubFlow: "Sub-Flow",
  nodeOutputGuard: "Guardia de Salida",
  nodeRAGSearch: "Búsqueda RAG",
  nodeMemory: "Memoria",
  nodeTransformer: "Transformador",
  nodeDelay: "Retardo",
  nodeSwitch: "Switch",
  nodeErrorHandler: "Manejo de Errores",
  close: "Cerrar",
  cancel: "Cancelar",
  confirm: "Confirmar",
  search: "Buscar",
  loading: "Cargando...",
  noResults: "Sin resultados",
  error: "Error",
  success: "Éxito",
  warning: "Advertencia",
  exportBackup: "Exportar Backup",
  importBackup: "Importar Backup",
  backupValid: "Backup válido",
  backupInvalid: "Backup inválido",
  exporting: "Exportando...",
  importing: "Importando...",
  agentLanguage: "Idioma del Agente",
  autoDetectLanguage: "Detectar idioma automáticamente",
  primaryLanguage: "Idioma principal",
  supportedLanguages: "Idiomas soportados",
  commandPalette: "Paleta de Comandos",
  typeCommand: "Escribe un comando...",
};

export const translations: Record<Locale, TranslationKeys> = {
  "pt-BR": ptBR,
  en,
  es,
};

export type { TranslationKeys };
