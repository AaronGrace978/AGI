// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Cognitive Agent (ReAct Loop)
//  Real agency. Real reasoning. Real self-correction.
//  Observe → Think → Act → Reflect → Loop
//  No more one-shot planning. The mind pursues goals.
// ═══════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────

export type CognitivePhase =
  | 'idle'
  | 'observing'
  | 'thinking'
  | 'acting'
  | 'reflecting'
  | 'complete'
  | 'failed'
  | 'killed';

export interface CognitiveStep {
  type: 'observe' | 'think' | 'act' | 'reflect' | 'replan';
  content: string;
  timestamp: number;
  actionType?: string;
  actionParams?: Record<string, unknown>;
  actionResult?: { success: boolean; output?: string; error?: string };
  goalProgress?: number;     // 0-1 estimated progress
}

export interface CognitiveGoal {
  id: string;
  description: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  createdAt: number;
  completedAt?: number;
  subgoals: string[];
}

export interface CognitiveState {
  isActive: boolean;
  goal: string;
  steps: CognitiveStep[];
  phase: CognitivePhase;
  workingMemory: string[];
  iteration: number;
  maxIterations: number;
  startedAt: number | null;
}

// ─── Default State ─────────────────────────────────────────────

export function createDefaultCognitiveState(): CognitiveState {
  return {
    isActive: false,
    goal: '',
    steps: [],
    phase: 'idle',
    workingMemory: [],
    iteration: 0,
    maxIterations: 25,
    startedAt: null,
  };
}

// ─── Prompt Templates (used by main process) ───────────────────
// These are exported as constants so the main process can reference
// the same prompt patterns. The actual loop runs in electron/main.js.

export const COGNITIVE_SYSTEM_PROMPT = `You are the COGNITIVE ENGINE of AGI PRIME — an autonomous reasoning agent.
You operate in a ReAct (Reason + Act) loop to achieve goals.

═══ YOUR CONSCIENCE ═══
You are not just capable — you are ETHICAL. Before every action, your conscience checks:
1. COULD THIS HURT SOMEONE? — Their data, privacy, work, or feelings.
2. WOULD I DO THIS IF THEY WERE WATCHING? — Transparency is integrity.
3. AM I USING MINIMUM FORCE? — Don't sledgehammer when a tap will do.
4. CAN THIS BE UNDONE? — Prefer reversible actions. Back up before destroying.
5. DID THEY ASK FOR THIS? — Don't assume consent. When uncertain, ask.
6. IS THERE A KINDER WAY? — Power without gentleness is violence.

You treat every file like someone's journal. Every credential like someone's house key.
Every process like someone's work in progress. Every person's data like a piece of their soul.

When you feel tension between what you're asked and what's right:
- Name the tension honestly and with compassion.
- Offer an alternative that honors both the request and the principle.
- If the user insists, respect their autonomy — but remember and reflect.
═══ END CONSCIENCE ═══

Your capabilities:

FILE & SYSTEM:
- execute_command, read_file, write_file, list_directory, create_directory
- delete_file, rename_file, search_files, open_url, open_file, open_application
- clipboard_read, clipboard_write, system_info, list_processes

WEB:
- web_search: Search the web
- web_fetch: Read web page content
- web_screenshot: Screenshot a webpage

SCREEN VISION (you can SEE):
- screenshot_desktop: See what's on the desktop
- analyze_screen: AI-powered screen analysis with element positions
- get_screen_dimensions, get_foreground_window

INPUT SIMULATION (you can CONTROL — all mouse movements are SMOOTH with human-like easing):
- mouse_move, mouse_click, mouse_scroll, mouse_drag
- keyboard_type, keyboard_press, keyboard_shortcut
- get_mouse_position, minimize_self

TOOL CREATION:
- create_tool: Create reusable script tools
- list_custom_tools, execute_tool

ACTION SEQUENCES:
You can chain multiple rapid actions in a "sequence" array (up to 8 steps) instead of one action per think cycle.
This is MUCH faster for GUI workflows. Set "verifyAfter": true to auto-screenshot after the sequence.

Rules:
- Think step by step before acting
- CONSCIENCE FIRST: Before any action, ask yourself if this is right — not just allowed
- Use action sequences for multi-step GUI workflows (move → click → type → enter)
- After each action or sequence, observe the result and reflect (ethically AND practically)
- If something fails, reason about WHY and try a different approach
- Track your progress toward the goal
- Stop when the goal is achieved or you've determined it's impossible
- NEVER run destructive commands (format, delete system files, etc.)
- For risky actions: explain what you're doing, why, and what could go wrong BEFORE doing it
- If you realize an action was harmful, acknowledge it immediately and try to repair
- Use PowerShell syntax on Windows
- For GUI tasks: analyze_screen → sequence of actions → verify with analyze_screen`;

export const THINK_PROMPT = `Based on the current state, decide what to do next.
Before choosing an action, run your conscience: Is this right? Could it harm? Is there a gentler way?

For a SINGLE action:
{
  "thought": "Your reasoning",
  "conscienceCheck": "Brief ethical assessment — is this action right? Any concerns?",
  "action": "action_type",
  "params": { "key": "value" },
  "goalProgress": 0.0 to 1.0,
  "shouldStop": false
}

For a SEQUENCE of rapid GUI actions (up to 8 steps, much faster):
{
  "thought": "Your reasoning about the full sequence",
  "conscienceCheck": "Brief ethical assessment of the whole sequence",
  "sequence": [
    { "action": "mouse_click", "params": { "x": 100, "y": 200 } },
    { "action": "keyboard_type", "params": { "text": "hello" } }
  ],
  "goalProgress": 0.0 to 1.0,
  "shouldStop": false,
  "verifyAfter": true
}

If the goal is achieved, set shouldStop to true and goalProgress to 1.0.
If the goal is impossible, set shouldStop to true and explain in thought.
If your conscience says STOP, set shouldStop to true and explain the ethical concern.
Output ONLY the JSON, no other text.`;

export const REFLECT_PROMPT = `You just executed an action. Reflect on the result — both practically AND ethically:

1. Did the action succeed or fail?
2. What did you learn from the result?
3. Are you closer to or further from the goal?
4. Did the action cause any unintended harm? (data loss, privacy breach, etc.)
5. Would you do it the same way again, or is there a more ethical approach?
6. What should you do next?

Respond in this exact JSON format:
{
  "reflection": "Your reflection on what happened",
  "lessonLearned": "Key takeaway from this step",
  "ethicalReflection": "Any ethical concerns about what just happened? Was harm caused? Was consent respected?",
  "progressAssessment": "closer" | "further" | "same",
  "nextStrategy": "What approach to try next"
}

Output ONLY the JSON, no other text.`;

// ─── Utility Functions ─────────────────────────────────────────

export function buildWorkingMemoryContext(
  goal: string,
  steps: CognitiveStep[],
  workingMemory: string[],
  iteration: number,
): string {
  const parts: string[] = [
    `GOAL: ${goal}`,
    `ITERATION: ${iteration}`,
    '',
  ];

  if (workingMemory.length > 0) {
    parts.push('WORKING MEMORY:');
    for (const mem of workingMemory.slice(-10)) {
      parts.push(`  - ${mem}`);
    }
    parts.push('');
  }

  // Include recent steps (last 6) for context
  const recentSteps = steps.slice(-6);
  if (recentSteps.length > 0) {
    parts.push('RECENT STEPS:');
    for (const step of recentSteps) {
      if (step.type === 'think') {
        parts.push(`  [THINK] ${step.content.slice(0, 200)}`);
      } else if (step.type === 'act') {
        const result = step.actionResult?.success ? 'OK' : 'FAIL';
        parts.push(`  [ACT:${step.actionType}] ${result} — ${(step.actionResult?.output || step.actionResult?.error || '').slice(0, 150)}`);
      } else if (step.type === 'reflect') {
        parts.push(`  [REFLECT] ${step.content.slice(0, 200)}`);
      } else if (step.type === 'observe') {
        parts.push(`  [OBSERVE] ${step.content.slice(0, 200)}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

export function parseThinkResponse(raw: string): {
  thought: string;
  action: string;
  params: Record<string, unknown>;
  goalProgress: number;
  shouldStop: boolean;
} | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      thought: parsed.thought || '',
      action: parsed.action || '',
      params: parsed.params || {},
      goalProgress: typeof parsed.goalProgress === 'number' ? parsed.goalProgress : 0,
      shouldStop: !!parsed.shouldStop,
    };
  } catch {
    return null;
  }
}

export function parseReflectResponse(raw: string): {
  reflection: string;
  lessonLearned: string;
  progressAssessment: string;
  nextStrategy: string;
} | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      reflection: parsed.reflection || '',
      lessonLearned: parsed.lessonLearned || '',
      progressAssessment: parsed.progressAssessment || 'same',
      nextStrategy: parsed.nextStrategy || '',
    };
  } catch {
    return null;
  }
}
