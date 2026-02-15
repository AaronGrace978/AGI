import type { HorizonPlan, HorizonStep, SparkGoal } from '../types';

function hid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createInitialHorizonPlan(goal: SparkGoal): HorizonPlan {
  const steps: HorizonStep[] = [
    {
      id: hid('hs'),
      description: 'Define measurable success criteria.',
      status: 'pending',
      dependsOn: [],
      verification: 'Checklist has concrete acceptance tests.',
      confidence: 0.7,
    },
    {
      id: hid('hs'),
      description: 'Build phased plan with dependency ordering.',
      status: 'pending',
      dependsOn: [],
      verification: 'Phases are executable and ordered.',
      confidence: 0.65,
    },
    {
      id: hid('hs'),
      description: 'Execute next actionable phase and collect evidence.',
      status: 'pending',
      dependsOn: [],
      verification: 'Artifacts or outcomes attached as evidence.',
      confidence: 0.6,
    },
  ];

  return {
    id: hid('hp'),
    goalId: goal.id,
    horizonHours: 24,
    status: 'active',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastExecutedStepId: null,
    steps,
    risks: ['Ambiguous requirements', 'Verification gaps', 'Resource constraints'],
    assumptions: ['Tools are available', 'State remains consistent across cycles'],
  };
}

export function advanceHorizonPlan(plan: HorizonPlan): HorizonPlan {
  if (plan.status !== 'active') return plan;
  const next = { ...plan, steps: plan.steps.map((s) => ({ ...s })) };
  const running = next.steps.find((s) => s.status === 'running');
  if (running) {
    running.status = 'done';
    next.lastExecutedStepId = running.id;
  } else {
    const pending = next.steps.find((s) => s.status === 'pending');
    if (pending) {
      pending.status = 'running';
      next.lastExecutedStepId = pending.id;
    }
  }

  const done = next.steps.filter((s) => s.status === 'done').length;
  next.progress = done / Math.max(1, next.steps.length);
  next.updatedAt = Date.now();
  if (done === next.steps.length) {
    next.status = 'completed';
  }
  return next;
}
