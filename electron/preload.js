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

  // ─── Settings ──────────────────────────────────────────
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (newSettings) => ipcRenderer.invoke('settings:set', newSettings),
  },

  // ─── Memory ────────────────────────────────────────────
  memory: {
    get: () => ipcRenderer.invoke('memory:get'),
    update: (updates) => ipcRenderer.invoke('memory:update', updates),
    addFact: (fact) => ipcRenderer.invoke('memory:addFact', fact),
    storeVector: (entry) => ipcRenderer.invoke('memory:storeVector', entry),
    searchVector: (query, topK, typeFilter) => ipcRenderer.invoke('memory:searchVector', query, topK, typeFilter),
    vectorStats: () => ipcRenderer.invoke('memory:vectorStats'),
  },

  // ─── LLM (Non-Streaming) ─────────────────────────────
  llm: {
    generate: (messages, config) => ipcRenderer.invoke('llm:generate', messages, config),
  },

  // ─── System ────────────────────────────────────────────
  system: {
    info: () => ipcRenderer.invoke('system:info'),
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

    // AI-powered task planning & execution
    planAndExecute: (request) => ipcRenderer.send('agent:planAndExecute', request),

    // Cognitive loop (ReAct)
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
      ['agent:status', 'agent:plan', 'agent:stepStart', 'agent:stepDone', 'agent:complete', 'agent:error', 'agent:cognitiveStep', 'agent:cognitiveComplete']
        .forEach((ch) => ipcRenderer.removeAllListeners(ch));
    },
  },

  // ─── SPARK ─────────────────────────────────────────────
  spark: {
    getState: () => ipcRenderer.invoke('spark:getState'),
    saveState: (state) => ipcRenderer.invoke('spark:saveState', state),
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
