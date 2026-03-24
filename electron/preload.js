const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ─── Chat ──────────────────────────────────────────────
  chat: {
    send: (messages, config) => ipcRenderer.send('chat:send', messages, config),
    onChunk: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('chat:chunk', handler);
      return () => ipcRenderer.removeListener('chat:chunk', handler);
    },
    onDone: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('chat:done', handler);
      return () => ipcRenderer.removeListener('chat:done', handler);
    },
    onError: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('chat:error', handler);
      return () => ipcRenderer.removeListener('chat:error', handler);
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('chat:chunk');
      ipcRenderer.removeAllListeners('chat:done');
      ipcRenderer.removeAllListeners('chat:error');
    },
  },

  // ─── Chat History (Export / Import / Past chats) ─────────────
  chatHistory: {
    export: (messages) => ipcRenderer.invoke('chatHistory:export', messages),
    import: () => ipcRenderer.invoke('chatHistory:import'),
    list: () => ipcRenderer.invoke('chatHistory:list'),
    load: (filePath) => ipcRenderer.invoke('chatHistory:load', filePath),
  },

  // ─── Conversations (persisted Nexus sessions) ────────────────
  conversations: {
    list: () => ipcRenderer.invoke('conversations:list'),
    load: (conversationId) => ipcRenderer.invoke('conversations:load', conversationId),
    save: (conversation) => ipcRenderer.invoke('conversations:save', conversation),
    rename: (conversationId, title) => ipcRenderer.invoke('conversations:rename', conversationId, title),
    delete: (conversationId) => ipcRenderer.invoke('conversations:delete', conversationId),
  },

  // ─── Arena ─────────────────────────────────────────────
  arena: {
    start: (prompt, config) => ipcRenderer.send('arena:start', prompt, config),
    onAgentStart: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('arena:agentStart', handler);
      return () => ipcRenderer.removeListener('arena:agentStart', handler);
    },
    onAgentChunk: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('arena:agentChunk', handler);
      return () => ipcRenderer.removeListener('arena:agentChunk', handler);
    },
    onAgentDone: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('arena:agentDone', handler);
      return () => ipcRenderer.removeListener('arena:agentDone', handler);
    },
    onComplete: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('arena:complete', handler);
      return () => ipcRenderer.removeListener('arena:complete', handler);
    },
    onError: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('arena:error', handler);
      return () => ipcRenderer.removeListener('arena:error', handler);
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('arena:agentStart');
      ipcRenderer.removeAllListeners('arena:agentChunk');
      ipcRenderer.removeAllListeners('arena:agentDone');
      ipcRenderer.removeAllListeners('arena:complete');
      ipcRenderer.removeAllListeners('arena:error');
    },
  },

  // ─── Models ────────────────────────────────────────────
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    checkOllama: () => ipcRenderer.invoke('ollama:check'),
  },

  // ─── Provider Health ──────────────────────────────────
  providers: {
    health: () => ipcRenderer.invoke('providers:health'),
  },

  // ─── Settings ──────────────────────────────────────────
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (newSettings) => ipcRenderer.invoke('settings:set', newSettings),
  },

  // ─── AGI Score (rubric + history) ──────────────────────
  agiScore: {
    getConfig: () => ipcRenderer.invoke('agiScore:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('agiScore:setConfig', config),
    appendSnapshot: (snapshot) => ipcRenderer.invoke('agiScore:appendSnapshot', snapshot),
    listSnapshots: (options) => ipcRenderer.invoke('agiScore:listSnapshots', options),
  },

  // ─── Operator Synthesis Profile ─────────────────────────
  operatorProfile: {
    get: () => ipcRenderer.invoke('operatorProfile:get'),
    save: (profile) => ipcRenderer.invoke('operatorProfile:save', profile),
  },

  // ─── Memory ────────────────────────────────────────────
  memory: {
    get: () => ipcRenderer.invoke('memory:get'),
    getSummary: (options) => ipcRenderer.invoke('memory:getSummary', options),
    update: (updates) => ipcRenderer.invoke('memory:update', updates),
    addFact: (fact) => ipcRenderer.invoke('memory:addFact', fact),
    storeVector: (entry) => ipcRenderer.invoke('memory:storeVector', entry),
    searchVector: (query, topK, typeFilter) => ipcRenderer.invoke('memory:searchVector', query, topK, typeFilter),
    vectorStats: () => ipcRenderer.invoke('memory:vectorStats'),
    listVectors: (options) => ipcRenderer.invoke('memory:listVectors', options),
    export: (options) => ipcRenderer.invoke('memory:export', options),
    import: (importPath) => ipcRenderer.invoke('memory:import', importPath),
    listExports: () => ipcRenderer.invoke('memory:listExports'),
    ingestDocument: (filePath) => ipcRenderer.invoke('memory:ingestDocument', filePath),
  },

  // ─── LLM (Non-Streaming) ─────────────────────────────
  llm: {
    generate: (messages, config) => ipcRenderer.invoke('llm:generate', messages, config),
  },

  // ─── System ────────────────────────────────────────────
  system: {
    info: () => ipcRenderer.invoke('system:info'),
    healthSummary: () => ipcRenderer.invoke('system:healthSummary'),
  },

  update: {
    check: () => ipcRenderer.invoke('update:check'),
    openDownload: (url) => ipcRenderer.invoke('update:openDownload', url),
  },

  // ─── NightMind ─────────────────────────────────────────
  nightmind: {
    onInsight: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('nightmind:insight', handler);
      return () => ipcRenderer.removeListener('nightmind:insight', handler);
    },
  },

  // ─── HANDS: Agent System ──────────────────────────────
  agent: {
    // Direct operations
    execute: (command) => ipcRenderer.invoke('agent:execute', command),
    readFile: (path) => ipcRenderer.invoke('agent:readFile', path),
    writeFile: (path, content) => ipcRenderer.invoke('agent:writeFile', path, content),
    listDir: (path) => ipcRenderer.invoke('agent:listDir', path),
    createDir: (path) => ipcRenderer.invoke('agent:createDir', path),
    deleteFile: (path) => ipcRenderer.invoke('agent:deleteFile', path),
    renameFile: (oldPath, newPath) => ipcRenderer.invoke('agent:renameFile', oldPath, newPath),
    searchFiles: (dir, pattern) => ipcRenderer.invoke('agent:searchFiles', dir, pattern),
    openUrl: (url) => ipcRenderer.invoke('agent:openUrl', url),
    openApp: (path) => ipcRenderer.invoke('agent:openApp', path),
    openFile: (path) => ipcRenderer.invoke('agent:openFile', path),
    clipboard: (action, text) => ipcRenderer.invoke('agent:clipboard', action, text),
    systemDetails: () => ipcRenderer.invoke('agent:systemDetails'),
    listProcesses: () => ipcRenderer.invoke('agent:listProcesses'),

    // Web tools (full autonomy)
    webFetch: (url, options) => ipcRenderer.invoke('agent:webFetch', url, options),
    webSearch: (query, options) => ipcRenderer.invoke('agent:webSearch', query, options),
    webScreenshot: (url) => ipcRenderer.invoke('agent:webScreenshot', url),
    elevenlabsTts: (text, options) => ipcRenderer.invoke('agent:elevenlabsTts', text, options),
    elevenlabsGenerateMusic: (prompt, options) => ipcRenderer.invoke('agent:elevenlabsGenerateMusic', prompt, options),
    elevenlabsSing: (options) => ipcRenderer.invoke('agent:elevenlabsSing', options),

    // Screen Vision (The Eyes)
    screenshotDesktop: (options) => ipcRenderer.invoke('agent:screenshotDesktop', options),
    analyzeScreen: (prompt, options) => ipcRenderer.invoke('agent:analyzeScreen', prompt, options),
    getScreenDimensions: () => ipcRenderer.invoke('agent:getScreenDimensions'),
    getForegroundWindow: () => ipcRenderer.invoke('agent:getForegroundWindow'),

    // Input Simulation (The True Hands)
    mouseMove: (x, y) => ipcRenderer.invoke('agent:mouseMove', x, y),
    mouseClick: (x, y, button, doubleClick) => ipcRenderer.invoke('agent:mouseClick', x, y, button, doubleClick),
    mouseScroll: (x, y, amount) => ipcRenderer.invoke('agent:mouseScroll', x, y, amount),
    mouseDrag: (fromX, fromY, toX, toY) => ipcRenderer.invoke('agent:mouseDrag', fromX, fromY, toX, toY),
    keyboardType: (text) => ipcRenderer.invoke('agent:keyboardType', text),
    keyboardPress: (key) => ipcRenderer.invoke('agent:keyboardPress', key),
    keyboardShortcut: (modifiers, key) => ipcRenderer.invoke('agent:keyboardShortcut', modifiers, key),
    getMousePosition: () => ipcRenderer.invoke('agent:getMousePosition'),
    minimizeSelf: () => ipcRenderer.invoke('agent:minimizeSelf'),

    // Tool Creation (Self-extending)
    createTool: (tool) => ipcRenderer.invoke('agent:createTool', tool),
    listTools: () => ipcRenderer.invoke('agent:listTools'),
    executeTool: (toolId, params) => ipcRenderer.invoke('agent:executeTool', toolId, params),
    listRollbacks: () => ipcRenderer.invoke('agent:listRollbacks'),
    executeRollback: (rollbackId) => ipcRenderer.invoke('agent:executeRollback', rollbackId),
    resolveConsent: (requestId, decision) => ipcRenderer.invoke('agent:resolveConsent', requestId, decision),
    ledgerCreateRun: (kind, metadata) => ipcRenderer.invoke('agent:ledgerCreateRun', kind, metadata),
    ledgerAppend: (runId, entryType, payload) => ipcRenderer.invoke('agent:ledgerAppend', runId, entryType, payload),
    ledgerFinalize: (runId, summary) => ipcRenderer.invoke('agent:ledgerFinalize', runId, summary),
    ledgerListRuns: () => ipcRenderer.invoke('agent:ledgerListRuns'),
    ledgerReadRun: (runId) => ipcRenderer.invoke('agent:ledgerReadRun', runId),
    replayListRuns: () => ipcRenderer.invoke('agent:replayListRuns'),
    replayLoadRun: (runId) => ipcRenderer.invoke('agent:replayLoadRun', runId),
    handsDoctor: () => ipcRenderer.invoke('agent:handsDoctor'),
    handsReplayCheck: (runId) => ipcRenderer.invoke('agent:handsReplayCheck', runId),
    handsExportPrimeOS: (opts) => ipcRenderer.invoke('agent:handsExportPrimeOS', opts),
    setRuntimeControls: (partial) => ipcRenderer.invoke('agent:setRuntimeControls', partial),
    getRuntimeControls: () => ipcRenderer.invoke('agent:getRuntimeControls'),
    operatorLoopGet: () => ipcRenderer.invoke('agent:operatorLoop:get'),
    operatorLoopSetGoal: (contract) => ipcRenderer.invoke('agent:operatorLoop:setGoal', contract),

    // AI-powered task planning & execution
    planAndExecute: (request) => ipcRenderer.send('agent:planAndExecute', request),

    // Cognitive loop (ReAct)
    // goal can be a string or an object: { goal, contextAddendum?, origin? }
    startCognitive: (goal) => ipcRenderer.send('agent:startCognitive', goal),
    killCognitive: () => ipcRenderer.send('agent:killCognitive'),
    onCognitiveStep: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:cognitiveStep', h);
      return () => ipcRenderer.removeListener('agent:cognitiveStep', h);
    },
    onCognitiveComplete: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:cognitiveComplete', h);
      return () => ipcRenderer.removeListener('agent:cognitiveComplete', h);
    },
    onConsentRequested: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:consentRequested', h);
      return () => ipcRenderer.removeListener('agent:consentRequested', h);
    },
    onStatus: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:status', h);
      return () => ipcRenderer.removeListener('agent:status', h);
    },
    onPlan: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:plan', h);
      return () => ipcRenderer.removeListener('agent:plan', h);
    },
    onStepStart: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:stepStart', h);
      return () => ipcRenderer.removeListener('agent:stepStart', h);
    },
    onStepDone: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:stepDone', h);
      return () => ipcRenderer.removeListener('agent:stepDone', h);
    },
    onComplete: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:complete', h);
      return () => ipcRenderer.removeListener('agent:complete', h);
    },
    onError: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('agent:error', h);
      return () => ipcRenderer.removeListener('agent:error', h);
    },
    removeAllListeners: () => {
      ['agent:status', 'agent:plan', 'agent:stepStart', 'agent:stepDone', 'agent:complete', 'agent:error', 'agent:cognitiveStep', 'agent:cognitiveComplete', 'agent:consentRequested']
        .forEach((ch) => ipcRenderer.removeAllListeners(ch));
    },
  },

  // ─── SPARK ─────────────────────────────────────────────
  spark: {
    getState: () => ipcRenderer.invoke('spark:getState'),
    saveState: (state) => ipcRenderer.invoke('spark:saveState', state),
    reason: (input) => ipcRenderer.invoke('spark:reason', input),
  },

  gate: {
    evaluate: (action, gate) => ipcRenderer.invoke('gate:evaluate', action, gate),
  },

  // ─── Orchestrator (PrimeOS service spine) ─────────────
  orchestrator: {
    status: () => ipcRenderer.invoke('orchestrator:status'),
    missionSnapshot: (options) => ipcRenderer.invoke('orchestrator:missionSnapshot', options),
    setProfile: (profile) => ipcRenderer.invoke('orchestrator:setProfile', profile),
    setRunbookRole: (role) => ipcRenderer.invoke('orchestrator:setRunbookRole', role),
    command: (command) => ipcRenderer.invoke('orchestrator:command', command),
    listEvents: (options) => ipcRenderer.invoke('orchestrator:listEvents', options),
    exportEvents: (options) => ipcRenderer.invoke('orchestrator:exportEvents', options),
    prepareRunbookAction: (actionId) => ipcRenderer.invoke('orchestrator:prepareRunbookAction', actionId),
    runbookAction: (actionId, options) => ipcRenderer.invoke('orchestrator:runbookAction', actionId, options),
    onEvent: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('orchestrator:event', h);
      return () => ipcRenderer.removeListener('orchestrator:event', h);
    },
  },

  // ─── NeuralCore (Physics-Informed Neural Engine) ──────
  neural: {
    getStatus: () => ipcRenderer.invoke('neural:status'),
    predict: (params) => ipcRenderer.invoke('neural:predict', params),
    train: (params) => ipcRenderer.invoke('neural:train', params),
    getModelStats: () => ipcRenderer.invoke('neural:modelStats'),
    generateTrajectory: (params) => ipcRenderer.invoke('neural:generateTrajectory', params),
    loadModels: (checkpoint) => ipcRenderer.invoke('neural:loadModels', checkpoint),
    plan: (params) => ipcRenderer.invoke('neural:plan', params),
    onTrainingProgress: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('neural:trainingProgress', h);
      return () => ipcRenderer.removeListener('neural:trainingProgress', h);
    },
  },

  // ─── Goals (Persistent) ──────────────────────────────────
  goals: {
    list: () => ipcRenderer.invoke('goals:list'),
    create: (goal) => ipcRenderer.invoke('goals:create', goal),
    update: (goalId, updates) => ipcRenderer.invoke('goals:update', goalId, updates),
    delete: (goalId) => ipcRenderer.invoke('goals:delete', goalId),
  },

  // ─── Proactive Events ───────────────────────────────────
  proactive: {
    onEvent: (cb) => {
      const h = (_e, d) => cb(d);
      ipcRenderer.on('proactive:event', h);
      return () => ipcRenderer.removeListener('proactive:event', h);
    },
  },

  // ─── Window ────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
});
