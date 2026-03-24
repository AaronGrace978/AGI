// ═══════════════════════════════════════════════════════════════
//  NEURALCORE — Physics-Informed Neural Engine Bridge
//  Manages the Python NeuralCore subprocess (JSON-over-stdio IPC).
//  PINN-style constraint losses encode "physics of UI interaction"
//  so the network learns correct behavior from few demonstrations.
//
//  total_loss = L_data + λ₁·L_causality + λ₂·L_safety + λ₃·L_fitts + λ₄·L_ui
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const { spawn } = require('child_process');

const KNOWN_PYTHON_PATHS = [
  'A:\\Python\\python.exe',                                                  // Desktop
  'C:\\Users\\AGrac\\AppData\\Local\\Programs\\Python\\Python313\\python.exe', // Laptop
];

function resolvePythonPath() {
  for (const p of KNOWN_PYTHON_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return 'python'; // fall back to PATH
}

class NeuralCoreBridge {
  constructor(scriptsDir, userDataPath) {
    this.scriptsDir = scriptsDir;
    this.userDataPath = userDataPath;
    this.process = null;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.modelsLoaded = false;
    this.ready = false;
    this.buffer = '';
    this.circuitFailures = 0;
    this.circuitOpenUntil = 0;
  }

  start() {
    if (this.process) return;
    const pythonExe = resolvePythonPath();
    this.process = spawn(pythonExe, [
      '-m', 'neuralcore.bridge.serve',
      '--user-data-path', this.userDataPath,
    ], {
      cwd: this.scriptsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString();
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          this._handleMessage(JSON.parse(line));
        } catch (e) {
          console.error('[NeuralCore] Parse error:', line.slice(0, 200));
        }
      }
    });

    this.process.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) console.log('[NeuralCore:stderr]', text.slice(0, 500));
    });

    this.process.on('close', (code) => {
      console.log(`[NeuralCore] Process exited (code ${code})`);
      this.process = null;
      this.ready = false;
      for (const [, { reject }] of this.pendingRequests) {
        reject(new Error('NeuralCore process exited'));
      }
      this.pendingRequests.clear();
    });

    this.process.on('error', (err) => {
      console.error('[NeuralCore] Spawn error:', err.message);
      this.process = null;
      this.ready = false;
    });

    console.log('[NeuralCore] Bridge subprocess spawned');
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.ready = false;
    this.modelsLoaded = false;
  }

  get available() {
    return this.process !== null && this.ready;
  }

  _handleMessage(msg) {
    const { mainWindow } = require('./ctx');
    if (msg.event) {
      if (msg.event === 'ready') {
        this.ready = true;
        console.log('[NeuralCore] Bridge ready (v' + (msg.data?.version || '?') + ')');
      } else if (msg.event === 'training_progress') {
        mainWindow?.webContents.send('neural:trainingProgress', msg.data);
      }
      return;
    }
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    }
  }

  _sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (Date.now() < this.circuitOpenUntil) {
        return reject(new Error(`NeuralCore circuit open for ${method}`));
      }
      if (!this.process) return reject(new Error('NeuralCore not running'));
      const id = `req_${++this.requestId}`;
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.process.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      } catch (e) {
        this.pendingRequests.delete(id);
        return reject(new Error('NeuralCore stdin write failed: ' + e.message));
      }
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          this.circuitFailures += 1;
          if (this.circuitFailures >= 3) {
            this.circuitOpenUntil = Date.now() + 30000;
            console.warn('[NeuralCore] Circuit opened after repeated timeouts');
          }
          reject(new Error(`NeuralCore timeout: ${method}`));
        }
      }, 180000);
    });
  }

  async loadModels(checkpoint = 'best') {
    const result = await this._sendRequest('load', { checkpoint });
    this.circuitFailures = 0;
    this.circuitOpenUntil = 0;
    this.modelsLoaded = result?.loaded || false;
    return result;
  }

  async getStatus() { return this._sendWithCircuit('status'); }
  async predict(params) { return this._sendWithCircuit('predict', params); }
  async train(params) { return this._sendWithCircuit('train', params); }
  async getModelStats() { return this._sendWithCircuit('model_stats'); }
  async generateTrajectory(params) { return this._sendWithCircuit('generate_trajectory', params); }
  async plan(params) { return this._sendWithCircuit('plan', params); }

  async _sendWithCircuit(method, params = {}) {
    try {
      const result = await this._sendRequest(method, params);
      this.circuitFailures = 0;
      this.circuitOpenUntil = 0;
      return result;
    } catch (error) {
      this.circuitFailures += 1;
      if (this.circuitFailures >= 3) {
        this.circuitOpenUntil = Date.now() + 30000;
        console.warn(`[NeuralCore] Circuit opened after failures (${method})`);
      }
      throw error;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  NeuralCore ←→ HANDS Bridge
//  Routes UI actions through physics-informed neural predictions
//  when trained models are available. Falls back to raw LLM
//  coordinates when NeuralCore is offline or untrained.
// ═══════════════════════════════════════════════════════════════

const NEURAL_ENHANCED_ACTIONS = new Set([
  'mouse_click', 'mouse_move', 'mouse_drag',
]);

async function neuralEnhanceAction(action, params, recentSteps) {
  const { settings, neuralBridge } = require('./ctx');
  if (settings.disableNeuralCore) return null;
  if (!neuralBridge?.available || !neuralBridge.modelsLoaded) return null;
  if (!NEURAL_ENHANCED_ACTIONS.has(action)) return null;

  try {
    const intentAction = action === 'mouse_click' ? 'click'
      : action === 'mouse_move' ? 'move'
      : action === 'mouse_drag' ? 'drag'
      : action;

    const recentActions = (recentSteps || [])
      .filter(s => s.type === 'act' && s.actionType)
      .slice(-5)
      .map(s => ({ type: s.actionType, params: s.actionParams || {} }));

    const prediction = await neuralBridge.predict({
      intent_action: intentAction,
      intent_target: params.target || params.element || '',
      intent_confidence: 0.8,
      app_name: params.app || '',
      recent_actions: recentActions,
      temperature: 0.3,
    });

    if (!prediction?.steps || prediction.steps.length === 0) return null;

    const step = prediction.steps[0];
    if (typeof step.confidence === 'number' && step.confidence < 0.4) return null;

    const enhanced = { ...params };
    if (typeof step.x === 'number' && typeof step.y === 'number') {
      enhanced.x = step.x;
      enhanced.y = step.y;
      enhanced._neuralEnhanced = true;
      enhanced._neuralConfidence = step.confidence || 0;
      enhanced._neuralRisk = step.risk || 0;
    }
    if (step.timing_ms && action === 'mouse_click') {
      enhanced._neuralTimingMs = step.timing_ms;
    }

    return enhanced;
  } catch (e) {
    console.log('[NeuralCore] Enhancement skipped:', e.message);
    return null;
  }
}

module.exports = {
  NeuralCoreBridge,
  neuralEnhanceAction,
  NEURAL_ENHANCED_ACTIONS,
};
