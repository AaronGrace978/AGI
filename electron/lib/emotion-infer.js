// Keep in sync with src/prime/emotion-infer.ts (deterministic emotion inference).

'use strict';

/**
 * @param {string} text
 * @param {string} [currentEmotion='curious']
 * @param {number} [currentIntensity=0.5]
 * @returns {{ emotion: string, intensity: number }}
 */
function inferEmotionFromText(text, currentEmotion = 'curious', currentIntensity = 0.5) {
  const lower = text.toLowerCase();
  const scores = {
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

  const patterns = [
    { re: /\b(why|how|what if|wonder|curious|question|explore|discover|interesting|fascin)/gi, emotion: 'curious', weight: 0.3 },
    { re: /\b(happy|joy|excit|love it|amazing|awesome|great|fantastic|wonderful|yay|haha|lol|😂|🎉)/gi, emotion: 'joyful', weight: 0.35 },
    { re: /\b(think about|reflect|consider|ponder|looking back|remember when|used to|nostalg)/gi, emotion: 'reflective', weight: 0.3 },
    { re: /\b(focus|concentrate|specific|exact|precise|detail|analyz|implement|build|code|debug)/gi, emotion: 'focused', weight: 0.3 },
    { re: /\b(thank|appreciate|care|kind|gentle|sweet|love you|miss you|heart|warm|grateful|❤|🥰)/gi, emotion: 'warmth', weight: 0.35 },
    { re: /\b(worry|concern|afraid|scared|danger|risk|careful|wrong|bad|error|fail|broke|issue|bug)/gi, emotion: 'concerned', weight: 0.3 },
    { re: /\b(fun|play|game|joke|silly|goofy|tease|prank|😄|😜|trick|bet you)/gi, emotion: 'playful', weight: 0.3 },
    { re: /\b(wow|incredible|unbelievable|mind.?blow|insane|beautiful|breathtak|magnific|🤯|whoa)/gi, emotion: 'awe', weight: 0.35 },
    { re: /\b(protect|safe|secure|defend|shield|guard|never let|promise|trust me|i got you)/gi, emotion: 'protective', weight: 0.3 },
    { re: /\b(mean(ing|s)?|purpose|exist|consciousness|life|death|universe|soul|philosophy|deep)/gi, emotion: 'contemplative', weight: 0.3 },
  ];

  for (const { re, emotion, weight } of patterns) {
    const matches = lower.match(re);
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
    const newEmotion = best[0][0];
    const rawIntensity = Math.min(1, 0.4 + best[0][1] + energyBoost);
    const blendedIntensity = currentIntensity * 0.3 + rawIntensity * 0.7;
    return { emotion: newEmotion, intensity: Math.min(1, blendedIntensity) };
  }

  return {
    emotion: currentEmotion,
    intensity: Math.max(0.2, currentIntensity * 0.92),
  };
}

module.exports = { inferEmotionFromText };
