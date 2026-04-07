// ═══════════════════════════════════════════════════════════════
//  Emotion inference — shared logic (renderer + keep in sync with Electron)
// ═══════════════════════════════════════════════════════════════

import type { EmotionType } from '../types';

/**
 * Fast, deterministic emotion inference from text content.
 * No LLM call — runs instantly using keyword/pattern matching.
 */
export function inferEmotionFromText(
  text: string,
  currentEmotion: EmotionType = 'curious',
  currentIntensity: number = 0.5,
): { emotion: EmotionType; intensity: number } {
  const lower = text.toLowerCase();
  const scores: Record<EmotionType, number> = {
    curious: 0,
    joyful: 0,
    reflective: 0,
    focused: 0,
    warmth: 0,
    concerned: 0,
    playful: 0,
    awe: 0,
    protective: 0,
    contemplative: 0,
  };

  const patterns: Array<{ regex: RegExp; emotion: EmotionType; weight: number }> = [
    {
      regex: /\b(why|how|what if|wonder|curious|question|explore|discover|interesting|fascin)/i,
      emotion: 'curious',
      weight: 0.3,
    },
    {
      regex: /\b(happy|joy|excit|love it|amazing|awesome|great|fantastic|wonderful|yay|haha|lol|😂|🎉)/i,
      emotion: 'joyful',
      weight: 0.35,
    },
    {
      regex: /\b(think about|reflect|consider|ponder|looking back|remember when|used to|nostalg)/i,
      emotion: 'reflective',
      weight: 0.3,
    },
    {
      regex: /\b(focus|concentrate|specific|exact|precise|detail|analyz|implement|build|code|debug)/i,
      emotion: 'focused',
      weight: 0.3,
    },
    {
      regex: /\b(thank|appreciate|care|kind|gentle|sweet|love you|miss you|heart|warm|grateful|❤|🥰)/i,
      emotion: 'warmth',
      weight: 0.35,
    },
    {
      regex: /\b(worry|concern|afraid|scared|danger|risk|careful|wrong|bad|error|fail|broke|issue|bug)/i,
      emotion: 'concerned',
      weight: 0.3,
    },
    { regex: /\b(fun|play|game|joke|silly|goofy|tease|prank|😄|😜|trick|bet you)/i, emotion: 'playful', weight: 0.3 },
    {
      regex: /\b(wow|incredible|unbelievable|mind.?blow|insane|beautiful|breathtak|magnific|🤯|whoa)/i,
      emotion: 'awe',
      weight: 0.35,
    },
    {
      regex: /\b(protect|safe|secure|defend|shield|guard|never let|promise|trust me|i got you)/i,
      emotion: 'protective',
      weight: 0.3,
    },
    {
      regex: /\b(mean(ing|s)?|purpose|exist|consciousness|life|death|universe|soul|philosophy|deep)/i,
      emotion: 'contemplative',
      weight: 0.3,
    },
  ];

  for (const { regex, emotion, weight } of patterns) {
    const matches = lower.match(new RegExp(regex.source, 'gi'));
    if (matches) {
      scores[emotion] += weight * Math.min(matches.length, 3);
    }
  }

  const exclamations = (text.match(/!/g) || []).length;
  const capsRatio = text.replace(/[^A-Z]/g, '').length / Math.max(1, text.replace(/\s/g, '').length);
  const energyBoost = Math.min(0.3, exclamations * 0.05 + capsRatio * 0.4);

  const questions = (text.match(/\?/g) || []).length;
  scores.curious += questions * 0.15;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (best[0][1] > 0.2) {
    const newEmotion = best[0][0] as EmotionType;
    const rawIntensity = Math.min(1, 0.4 + best[0][1] + energyBoost);
    const blendedIntensity = currentIntensity * 0.3 + rawIntensity * 0.7;
    return { emotion: newEmotion, intensity: Math.min(1, blendedIntensity) };
  }

  return {
    emotion: currentEmotion,
    intensity: Math.max(0.2, currentIntensity * 0.92),
  };
}
