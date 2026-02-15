import type { BrainRoute } from '../types';

export interface RouterInput {
  prompt: string;
  recentTurns: Array<{ role: string; content: string }>;
  complexityThreshold: number;
  uncertaintyThreshold: number;
}

export interface RouterDecision {
  route: BrainRoute;
  complexity: number;
  uncertainty: number;
  reason: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function estimateComplexity(prompt: string): number {
  const p = prompt.trim().toLowerCase();
  const words = p.split(/\s+/).filter(Boolean).length;
  const steps = (p.match(/\b(step|phase|plan|implement|architecture|evaluate|benchmark|autonom|verify|tradeoff|refactor)\b/g) || []).length;
  const conjunctions = (p.match(/\b(and|then|while|after|before|unless|except)\b/g) || []).length;
  const questions = (p.match(/\?/g) || []).length;
  return clamp01(words / 120 + steps * 0.06 + conjunctions * 0.03 + questions * 0.05);
}

function estimateUncertainty(prompt: string, recentTurns: Array<{ role: string; content: string }>): number {
  const p = prompt.toLowerCase();
  const hedge = (p.match(/\b(maybe|not sure|unclear|unknown|approx|guess|could)\b/g) || []).length;
  const novelty = (p.match(/\b(new|novel|unseen|never|first time|adversarial|shift)\b/g) || []).length;
  const contextShort = recentTurns.length < 3 ? 0.2 : 0;
  return clamp01(hedge * 0.15 + novelty * 0.12 + contextShort);
}

export function routeToBrain(input: RouterInput): RouterDecision {
  const complexity = estimateComplexity(input.prompt);
  const uncertainty = estimateUncertainty(input.prompt, input.recentTurns);
  const useSlow =
    complexity >= input.complexityThreshold ||
    uncertainty >= input.uncertaintyThreshold;

  if (useSlow) {
    return {
      route: 'slow',
      complexity,
      uncertainty,
      reason: complexity >= input.complexityThreshold
        ? 'Complex multi-step request detected.'
        : 'High uncertainty/novelty detected.',
    };
  }

  return {
    route: 'fast',
    complexity,
    uncertainty,
    reason: 'Low complexity and uncertainty; fast path is sufficient.',
  };
}

export function buildSlowBrainDirective(): string {
  return [
    'SLOW-BRAIN MODE ACTIVE:',
    '- Plan before concluding.',
    '- Make assumptions explicit and mark uncertainty.',
    '- Include verification checks for important claims/actions.',
    '- Prefer robust, testable outputs over style.',
  ].join('\n');
}
