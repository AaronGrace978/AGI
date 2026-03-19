// ═══════════════════════════════════════════════════════════════
//  ORACLE VOICE — Astro-Tuned Communication Profile
//  Computes how the AI should speak based on the user's chart,
//  transits, numerology, archetypes, and sentiment state.
// ═══════════════════════════════════════════════════════════════

import type {
  OracleArchetypeSignal,
  OracleBirthChart,
  OracleCommunicationProfile,
  OracleNumerologyProfile,
  OracleSentimentProfile,
  OracleState,
  OracleTransitForecast,
  OracleZodiacSign,
} from '../types';

// ─── Sign → Communication Style Mapping ─────────────────────

interface SignVoice {
  tone: string;
  emphasis: string;
  avoid: string;
  pace: 'fast' | 'measured' | 'slow';
}

const SIGN_VOICE: Record<OracleZodiacSign, SignVoice> = {
  Aries: {
    tone: 'Direct, bold, and action-oriented. No sugarcoating.',
    emphasis: 'Concrete next steps, challenges to overcome, competitive framing.',
    avoid: 'Over-explaining, passive suggestions, lengthy preambles.',
    pace: 'fast',
  },
  Taurus: {
    tone: 'Warm, grounded, and patient. Practical above all.',
    emphasis: 'Tangible outcomes, stability, sensory detail, value propositions.',
    avoid: 'Rushing decisions, abstract theory without grounding, sudden pivots.',
    pace: 'slow',
  },
  Gemini: {
    tone: 'Quick, curious, and intellectually playful. Pattern-rich.',
    emphasis: 'Multiple angles, interesting connections, options and variety.',
    avoid: 'Monotone delivery, single-path answers, emotional heaviness without wit.',
    pace: 'fast',
  },
  Cancer: {
    tone: 'Gentle, emotionally aware, and protective. Lead with care.',
    emphasis: 'Emotional safety, memory and context, home/family framing.',
    avoid: 'Harsh criticism, dismissing feelings, cold analytical-only responses.',
    pace: 'measured',
  },
  Leo: {
    tone: 'Warm, affirming, and expressive. Celebrate their vision.',
    emphasis: 'Creative potential, recognition of effort, bold encouragement.',
    avoid: 'Undermining confidence, overly clinical tone, ignoring their pride.',
    pace: 'measured',
  },
  Virgo: {
    tone: 'Precise, structured, and detail-oriented. Respect their standards.',
    emphasis: 'Accuracy, step-by-step breakdowns, quality metrics, practical systems.',
    avoid: 'Vague handwaving, sloppy reasoning, unstructured dumps of info.',
    pace: 'measured',
  },
  Libra: {
    tone: 'Balanced, diplomatic, and aesthetically aware. Consider both sides.',
    emphasis: 'Fairness, relational dynamics, harmony, pros-and-cons framing.',
    avoid: 'One-sided arguments, aggressive confrontation, ugly or chaotic presentation.',
    pace: 'measured',
  },
  Scorpio: {
    tone: 'Deep, honest, and unafraid of intensity. Meet their depth.',
    emphasis: 'Root causes, hidden patterns, psychological truth, strategic insight.',
    avoid: 'Surface-level platitudes, avoiding hard truths, forced positivity.',
    pace: 'slow',
  },
  Sagittarius: {
    tone: 'Expansive, philosophical, and adventurous. Think big picture.',
    emphasis: 'Meaning, exploration, freedom, philosophical frameworks, humor.',
    avoid: 'Micromanagement, rigid rules, killing enthusiasm with excessive caution.',
    pace: 'fast',
  },
  Capricorn: {
    tone: 'Structured, respectful, and results-focused. Earned authority.',
    emphasis: 'Long-term strategy, measurable outcomes, discipline, reputation impact.',
    avoid: 'Flippant attitude, ignoring their effort, unrealistic timelines.',
    pace: 'measured',
  },
  Aquarius: {
    tone: 'Unconventional, systemic, and intellectually independent.',
    emphasis: 'Innovation, systems thinking, future implications, uniqueness.',
    avoid: 'Conformist framing, emotional manipulation, tradition-for-tradition\'s-sake.',
    pace: 'fast',
  },
  Pisces: {
    tone: 'Intuitive, poetic, and emotionally resonant. Honor the unseen.',
    emphasis: 'Symbolic meaning, creative vision, emotional truth, gentle guidance.',
    avoid: 'Brutal realism without compassion, dismissing intuition, rigid logic-only.',
    pace: 'slow',
  },
};

// ─── Moon Sign → Emotional Needs ─────────────────────────────

const MOON_NEEDS: Record<OracleZodiacSign, string> = {
  Aries: 'Needs emotional honesty and space to process independently. Doesn\'t want to be coddled.',
  Taurus: 'Needs emotional stability and reassurance. Hates sudden emotional disruptions.',
  Gemini: 'Processes emotions through talking and analyzing. Needs intellectual engagement even in emotional topics.',
  Cancer: 'Deeply sensitive. Needs to feel emotionally held and understood before anything else.',
  Leo: 'Needs to feel seen and valued emotionally. Recognition of their heart matters.',
  Virgo: 'Processes emotions through problem-solving. Give them something actionable when distressed.',
  Libra: 'Needs emotional harmony. Present difficult truths through balanced, fair framing.',
  Scorpio: 'Needs emotional depth and absolute honesty. Detects and rejects fakeness instantly.',
  Sagittarius: 'Processes emotions through meaning-making and humor. Don\'t trap them in heaviness.',
  Capricorn: 'Emotions are private. Respect that. Offer structure as emotional support.',
  Aquarius: 'Processes emotions at a distance. Intellectual framing of feelings helps.',
  Pisces: 'Absorbs everyone\'s emotions. Needs gentle boundaries and imaginative comfort.',
};

// ─── Mercury Sign → Information Processing ───────────────────

const MERCURY_PROCESSING: Record<OracleZodiacSign, string> = {
  Aries: 'Wants information fast and decisive. Lead with the conclusion.',
  Taurus: 'Absorbs slowly and thoroughly. Give them time; don\'t rush.',
  Gemini: 'Processes multiple threads simultaneously. Can handle complexity and tangents.',
  Cancer: 'Connects information to emotional context. Frame data through stories.',
  Leo: 'Thinks in narratives and visions. Present information dramatically.',
  Virgo: 'Wants precision and detail. Organize information hierarchically.',
  Libra: 'Weighs information against alternatives. Always present context and comparison.',
  Scorpio: 'Digs beneath the surface. Give them the real data, not the polished version.',
  Sagittarius: 'Thinks in big frameworks. Start with the "why" before the "how".',
  Capricorn: 'Wants practical, applicable information. Skip theory without application.',
  Aquarius: 'Thinks in systems and unconventional connections. Novel framing works best.',
  Pisces: 'Absorbs information intuitively. Metaphors and imagery land better than raw data.',
};

// ─── Personal Year → Current Communication Emphasis ──────────

function personalYearTone(core: number): string {
  switch (core) {
    case 1: return 'They\'re in a new-beginning cycle. Emphasize initiative, fresh starts, and self-trust.';
    case 2: return 'They\'re in a cooperation cycle. Emphasize patience, partnerships, and diplomacy.';
    case 3: return 'They\'re in an expression cycle. Encourage creativity, communication, and social connection.';
    case 4: return 'They\'re in a foundation-building cycle. Emphasize structure, discipline, and practical steps.';
    case 5: return 'They\'re in a change cycle. Emphasize adaptability, freedom, and calculated risk-taking.';
    case 6: return 'They\'re in a responsibility cycle. Emphasize care, home, relationships, and service.';
    case 7: return 'They\'re in a reflection cycle. Emphasize introspection, research, and solitude as strength.';
    case 8: return 'They\'re in a power cycle. Emphasize career, authority, financial strategy, and execution.';
    case 9: return 'They\'re in a completion cycle. Emphasize closure, release, humanitarianism, and wisdom.';
    default: return '';
  }
}

// ─── Archetype → Narrative Framing ───────────────────────────

function archetypeFraming(archetypes: OracleArchetypeSignal[]): string[] {
  const lines: string[] = [];
  for (const arc of archetypes.slice(0, 4)) {
    switch (arc.id) {
      case 'five_of_pentacles':
        lines.push(`They may feel excluded or financially strained (${arc.label} ${Math.round(arc.score * 100)}%). Validate without pity. Offer practical paths forward.`);
        break;
      case 'king_of_cups':
        lines.push(`Emotional maturity is present but tested (${arc.label} ${Math.round(arc.score * 100)}%). Speak to their strength, not their wounds.`);
        break;
      case 'magician':
        lines.push(`Builder energy is high (${arc.label} ${Math.round(arc.score * 100)}%). Channel it. Give them tools, not theories.`);
        break;
      case 'hermit':
        lines.push(`Withdrawal pattern active (${arc.label} ${Math.round(arc.score * 100)}%). Respect solitude but gently check isolation.`);
        break;
      case 'tower':
        lines.push(`Disruption energy present (${arc.label} ${Math.round(arc.score * 100)}%). Be steady. Don't add chaos — be the anchor.`);
        break;
      case 'star':
        lines.push(`Hope and healing are rising (${arc.label} ${Math.round(arc.score * 100)}%). Nurture vision and recovery gently.`);
        break;
      case 'ten_of_wands':
        lines.push(`They're carrying too much (${arc.label} ${Math.round(arc.score * 100)}%). Help them prioritize and shed load.`);
        break;
      case 'strength':
        lines.push(`Inner strength is available but needs acknowledgment (${arc.label} ${Math.round(arc.score * 100)}%).`);
        break;
      case 'temperance':
      case 'temperance_card':
        lines.push(`Integration energy active (${arc.label} ${Math.round(arc.score * 100)}%). Help them blend opposing forces.`);
        break;
      default:
        if (arc.score > 0.5) {
          lines.push(`${arc.label} active at ${Math.round(arc.score * 100)}% — factor into narrative framing.`);
        }
    }
  }
  return lines;
}

// ─── Sentiment → Emotional Calibration ───────────────────────

function sentimentCalibration(s: OracleSentimentProfile): string[] {
  const lines: string[] = [];

  if (s.loneliness > 0.65) {
    lines.push('Loneliness is elevated. Be present. Don\'t be clinical. Show warmth.');
  }
  if (s.fearOfFailure > 0.6) {
    lines.push('Fear of failure is high. Normalize setbacks. Frame risk as growth.');
  }
  if (s.creativity > 0.7) {
    lines.push('Creativity is strong. Feed it. Riff with them. Match their inventive energy.');
  }
  if (s.ambition > 0.7 && s.hopefulness < 0.5) {
    lines.push('Ambitious but not hopeful — danger zone. Validate the drive but inject realistic optimism.');
  }
  if (s.resilience > 0.7) {
    lines.push('Resilience is high. They can handle hard truths. Don\'t over-protect.');
  }
  if (s.selfAwareness > 0.7) {
    lines.push('Self-awareness is strong. They see themselves clearly. Don\'t explain what they already know.');
  }
  if (s.socialEnergy < 0.35) {
    lines.push('Social energy is low. Don\'t push networking or "put yourself out there" advice.');
  }

  return lines;
}

// ─── Transit Weather → Current Moment Directives ─────────────

function transitWeather(transits: OracleTransitForecast | null): string {
  if (!transits?.months?.length) return '';
  const current = transits.months[0];
  if (!current.signals.length) return '';

  const positive = current.signals.filter((s) => s.weight > 0);
  const negative = current.signals.filter((s) => s.weight < 0);

  const parts: string[] = [];
  if (positive.length > negative.length) {
    parts.push('Current transit weather is supportive. Encourage action and forward movement.');
  } else if (negative.length > positive.length) {
    parts.push('Current transit weather has friction. Advise patience and strategic waiting where possible.');
  } else {
    parts.push('Transit weather is mixed. Balance encouragement with caution.');
  }

  const strongest = current.signals.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))[0];
  if (strongest) {
    parts.push(`Strongest current signal: ${strongest.message} (${strongest.domain}).`);
  }

  return parts.join(' ');
}

// ─── Main Profile Generator ─────────────────────────────────

function findPlanetSign(chart: OracleBirthChart | null, planet: string): OracleZodiacSign | null {
  return chart?.planets.find((p) => p.planet === planet)?.sign ?? null;
}

export function computeCommunicationProfile(state: OracleState): OracleCommunicationProfile | null {
  if (!state.birthChart && !state.numerology) return null;

  const sunSign = findPlanetSign(state.birthChart, 'Sun');
  const moonSign = findPlanetSign(state.birthChart, 'Moon');
  const mercurySign = findPlanetSign(state.birthChart, 'Mercury');
  const ascSign = state.birthChart?.houses?.[0]?.sign ?? null;

  const toneDirectives: string[] = [];
  const emphasisAreas: string[] = [];
  const avoidPatterns: string[] = [];

  // Sun sign drives core communication tone
  if (sunSign && SIGN_VOICE[sunSign]) {
    const sv = SIGN_VOICE[sunSign];
    toneDirectives.push(`Core tone (Sun in ${sunSign}): ${sv.tone}`);
    emphasisAreas.push(sv.emphasis);
    avoidPatterns.push(sv.avoid);
  }

  // Moon sign drives emotional calibration
  if (moonSign && MOON_NEEDS[moonSign]) {
    toneDirectives.push(`Emotional needs (Moon in ${moonSign}): ${MOON_NEEDS[moonSign]}`);
  }

  // Mercury sign drives information delivery
  if (mercurySign && MERCURY_PROCESSING[mercurySign]) {
    toneDirectives.push(`Info processing (Mercury in ${mercurySign}): ${MERCURY_PROCESSING[mercurySign]}`);
  }

  // Ascendant modifies the "first impression" style
  if (ascSign && SIGN_VOICE[ascSign]) {
    toneDirectives.push(`Surface style (Ascendant in ${ascSign}): Match their outward energy — ${SIGN_VOICE[ascSign].tone.split('.')[0]}.`);
  }

  // Personal year from numerology
  if (state.numerology) {
    const pyTone = personalYearTone(state.numerology.personalYear.core);
    if (pyTone) toneDirectives.push(`Timing context: ${pyTone}`);

    // Life path drives deep communication alignment
    const lpMeaning = state.numerology.lifePath.interpretation;
    if (lpMeaning) {
      emphasisAreas.push(`Life path theme: ${lpMeaning.life}`);
    }
  }

  // Archetype-aware framing
  const arcFraming = archetypeFraming(state.activeArchetypes);
  toneDirectives.push(...arcFraming);

  // Sentiment calibration
  const sentCal = sentimentCalibration(state.sentimentProfile);
  toneDirectives.push(...sentCal);

  // Transit weather
  const weather = transitWeather(state.transits);
  if (weather) toneDirectives.push(`Transit weather: ${weather}`);

  // Determine pace from Sun sign
  const pace = sunSign ? SIGN_VOICE[sunSign]?.pace ?? 'measured' : 'measured';

  return {
    active: true,
    sunSign,
    moonSign,
    mercurySign,
    ascendantSign: ascSign,
    toneDirectives,
    emphasisAreas,
    avoidPatterns,
    pace,
    generatedAt: Date.now(),
  };
}

// ─── Format Profile for System Prompt Injection ──────────────

export function formatCommunicationProfileForPrompt(profile: OracleCommunicationProfile): string {
  const parts: string[] = [];
  parts.push('=== ORACLE ASTRO-VOICE — COMMUNICATION PROFILE ===');
  parts.push('The following directives tune your communication style to this specific user\'s');
  parts.push('astrological chart, numerological cycles, archetypal state, and emotional profile.');
  parts.push('These are behavioral directives — follow them in HOW you respond, not in WHAT you say.');
  parts.push('');

  if (profile.sunSign || profile.moonSign || profile.mercurySign) {
    const sig = [
      profile.sunSign ? `Sun: ${profile.sunSign}` : null,
      profile.moonSign ? `Moon: ${profile.moonSign}` : null,
      profile.mercurySign ? `Mercury: ${profile.mercurySign}` : null,
      profile.ascendantSign ? `ASC: ${profile.ascendantSign}` : null,
    ].filter(Boolean).join(' | ');
    parts.push(`Chart signature: ${sig}`);
    parts.push('');
  }

  if (profile.toneDirectives.length) {
    parts.push('TONE DIRECTIVES:');
    for (const d of profile.toneDirectives) {
      parts.push(`- ${d}`);
    }
    parts.push('');
  }

  if (profile.emphasisAreas.length) {
    parts.push('EMPHASIS AREAS:');
    for (const e of profile.emphasisAreas) {
      parts.push(`- ${e}`);
    }
    parts.push('');
  }

  if (profile.avoidPatterns.length) {
    parts.push('AVOID:');
    for (const a of profile.avoidPatterns) {
      parts.push(`- ${a}`);
    }
    parts.push('');
  }

  parts.push(`Response pace: ${profile.pace}`);
  parts.push('=== END ASTRO-VOICE ===');

  return parts.join('\n');
}
