const { ipcMain } = require('electron');
const ctx = require('../ctx');

async function generateAutonomousGoals() {
  if (ctx.persistentGoals.goals.filter(g => g.status === 'active' && g.type === 'self-generated').length >= 3) return;

  try {
    const memStats = ctx.getVectorStats();
    const activeGoals = ctx.persistentGoals.goals.filter(g => g.status === 'active').map(g => g.description).join('; ');

    const prompt = [
      {
        role: 'system',
        content: `You are AGI PRIME's autonomous goal engine. Based on the system state, suggest 1-2 useful self-improvement goals. Goals should be actionable and benefit the user or improve the system.
Output a JSON array: [{ "description": "...", "priority": 1-10, "reasoning": "why this is useful" }]
Output ONLY the JSON array.`,
      },
      {
        role: 'user',
        content: `System state:
- Memory: ${memStats.total} memories (${memStats.byType.episodic} episodic, ${memStats.byType.semantic} semantic, ${memStats.byType.procedural} procedural)
- Custom tools: ${ctx.toolRegistry.tools.length} registered
- Active goals: ${activeGoals || 'none'}
- Platform: ${process.platform}
- Uptime: ${Math.round(process.uptime() / 60)} minutes

Suggest 1-2 autonomous improvement goals:`,
      },
    ];

    const response = await ctx.llmGenerate(prompt, { temperature: 0.6, maxTokens: 512 });
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      for (const suggestion of suggestions.slice(0, 2)) {
        if (suggestion.description && suggestion.description.length > 10) {
          const newGoal = {
            id: `goal_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            description: suggestion.description,
            type: 'self-generated',
            status: 'active',
            priority: suggestion.priority || 3,
            subgoals: [],
            progress: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            evidence: [suggestion.reasoning || ''],
            checkpoints: [],
          };
          ctx.persistentGoals.goals.push(newGoal);
          console.log(`[Goals] Auto-generated: ${suggestion.description}`);
        }
      }
      ctx.saveJSON(ctx.goalsFile, ctx.persistentGoals);
    }
  } catch (e) {
    console.log('[Goals] Auto-generation failed:', e.message);
  }
}

function register() {
  ctx.generateAutonomousGoals = generateAutonomousGoals;

  ipcMain.handle('goals:list', async () => {
    return { success: true, goals: ctx.persistentGoals.goals };
  });

  ipcMain.handle('goals:create', async (_, goal) => {
    const newGoal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      description: goal.description,
      type: goal.type || 'user-set',
      status: 'active',
      priority: goal.priority || 5,
      subgoals: goal.subgoals || [],
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      evidence: [],
      checkpoints: [],
    };
    ctx.persistentGoals.goals.push(newGoal);
    ctx.saveJSON(ctx.goalsFile, ctx.persistentGoals);
    ctx.emitOrchestratorEvent('goal_submitted', { goalId: newGoal.id, description: newGoal.description, priority: newGoal.priority }, 'operator');
    return { success: true, goal: newGoal };
  });

  ipcMain.handle('goals:update', async (_, goalId, updates) => {
    const goal = ctx.persistentGoals.goals.find(g => g.id === goalId);
    if (!goal) return { success: false, error: 'Goal not found' };
    const previousStatus = goal.status;
    Object.assign(goal, updates, { updatedAt: Date.now() });
    ctx.saveJSON(ctx.goalsFile, ctx.persistentGoals);
    if (previousStatus !== 'completed' && goal.status === 'completed') {
      ctx.emitOrchestratorEvent('goal_completed', { goalId: goal.id, description: goal.description }, 'orchestrator');
    }
    return { success: true, goal };
  });

  ipcMain.handle('goals:delete', async (_, goalId) => {
    ctx.persistentGoals.goals = ctx.persistentGoals.goals.filter(g => g.id !== goalId);
    ctx.saveJSON(ctx.goalsFile, ctx.persistentGoals);
    return { success: true };
  });
}

module.exports = { register };
