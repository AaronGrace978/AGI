// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Shared Context (Mutable Singleton)
//  Populated by main.js before IPC modules are registered.
//  All IPC modules require() this module to access shared state.
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // ─── Mutable State ───────────────────────────────────────────
  mainWindow: null,
  settings: null,
  memory: null,
  vectorStore: null,
  rollbackRegistry: null,
  auditLog: null,
  orchestratorState: null,
  runtimeControls: null,
  neuralBridge: null,
  toolRegistry: null,
  persistentGoals: null,
  operatorLoopState: null,

  // ─── Flags ───────────────────────────────────────────────────
  isDev: false,
  osBridgeEnabled: false,
  isAGIPrimeOS: false,
  DAEMON_MODE: false,
  SAFE_MODE: false,

  // ─── Paths ───────────────────────────────────────────────────
  dataDir: '',
  memoryFile: '',
  settingsFile: '',
  vectorFile: '',
  sparkFile: '',
  toolRegistryFile: '',
  goalsFile: '',
  agiScoreFile: '',
  rollbackRegistryFile: '',
  rollbackBackupDir: '',
  ledgerDir: '',
  auditLogFile: '',
  orchestratorEventsFile: '',
  orchestratorExportDir: '',
  operatorProfileFile: '',
  operatorDir: '',
  operatorGoalFile: '',
  operatorStateFile: '',
  conversationsDir: '',
  conversationsIndexFile: '',
  conversationsStateFile: '',
  inputHelperPath: '',
  neuralCoreScriptsDir: '',
  neuralDataDir: '',
  memoryExportDir: '',

  // ─── Consent / Runbook Pending Maps ──────────────────────────
  pendingConsentRequests: new Map(),
  pendingRunbookConfirmations: new Map(),

  // ─── Debounced Vector Write ──────────────────────────────────
  _pendingVectorWrite: false,

  // ─── Utilities (assigned by main.js) ─────────────────────────
  loadJSON: null,
  saveJSON: null,
  markVectorStoreDirty: null,
  flushVectorStore: null,
  storeVectorMemory: null,
  searchVectorMemories: null,
  getVectorStats: null,
  listVectorMemories: null,
  generateEmbedding: null,
  llmGenerate: null,
  llmGenerateMultimodal: null,
  checkOllama: null,
  appendAuditEvent: null,
  summarizeAuditEntries: null,
  emitOrchestratorEvent: null,
  listOrchestratorEvents: null,
  saveRollbackRegistry: null,
  registerRollbackEntry: null,
  updateRollbackEntry: null,
  getLedgerPath: null,
  createLedgerRun: null,
  appendLedgerEntry: null,
  finalizeLedgerRun: null,
  listLedgerRuns: null,
  saveOperatorLoopState: null,
  updateOperatorLoopState: null,
  updateConsciousness: null,
  addToConversationBuffer: null,
  neuralEnhanceAction: null,
  saveAgiScore: null,
  agiScore: null,
  executeIPC: null,

  // ─── External Modules ────────────────────────────────────────
  osBridge: null,
};
