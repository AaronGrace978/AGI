// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — IPC: NeuralCore Handlers
//  Thin wrappers around the NeuralCore bridge subprocess.
// ═══════════════════════════════════════════════════════════════

const { ipcMain } = require('electron');
const ctx = require('../ctx');

function register() {
  ipcMain.handle('neural:status', async () => {
    const nb = ctx.neuralBridge;
    if (!nb?.available) return { success: true, available: false, modelsLoaded: false };
    try {
      const s = await nb.getStatus();
      return { success: true, available: true, modelsLoaded: nb.modelsLoaded, ...s };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('neural:predict', async (_, params) => {
    const nb = ctx.neuralBridge;
    if (!nb?.available || !nb.modelsLoaded) return { success: false, error: 'NeuralCore not ready' };
    try {
      const result = await nb.predict(params);
      return { success: true, ...result };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('neural:train', async (_, params) => {
    const nb = ctx.neuralBridge;
    if (!nb?.available) return { success: false, error: 'NeuralCore not running' };
    try {
      const result = await nb.train(params || {});
      return { success: true, ...result };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('neural:modelStats', async () => {
    const nb = ctx.neuralBridge;
    if (!nb?.available) return { success: false, error: 'NeuralCore not running' };
    try {
      const result = await nb.getModelStats();
      return { success: true, ...result };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('neural:generateTrajectory', async (_, params) => {
    const nb = ctx.neuralBridge;
    if (!nb?.available) return { success: false, error: 'NeuralCore not running' };
    try {
      const result = await nb.generateTrajectory(params);
      return { success: true, ...result };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('neural:loadModels', async (_, checkpoint) => {
    const nb = ctx.neuralBridge;
    if (!nb?.available) return { success: false, error: 'NeuralCore not running' };
    try {
      const result = await nb.loadModels(checkpoint || 'best');
      return { success: true, ...result };
    } catch (e) { return { success: false, error: e.message }; }
  });

  ipcMain.handle('neural:plan', async (_, params) => {
    const nb = ctx.neuralBridge;
    if (!nb?.available || !nb.modelsLoaded) return { success: false, error: 'NeuralCore not ready' };
    try {
      const result = await nb.plan(params);
      return { success: true, ...result };
    } catch (e) { return { success: false, error: e.message }; }
  });
}

module.exports = { register };
