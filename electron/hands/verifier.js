function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function verifyActionOutcome({
  action,
  params,
  result,
  analyzeScreen,
  getForegroundWindow,
}) {
  if (!result?.success) {
    return { pass: false, reason: 'action-failed' };
  }

  if (action === 'open_application' || action === 'open_file' || action === 'open_url') {
    try {
      const fg = await getForegroundWindow();
      const out = normalizeText(fg?.output);
      if (out && out !== 'unknown') return { pass: true, reason: 'foreground-present' };
      return { pass: false, reason: 'foreground-unknown' };
    } catch {
      return { pass: false, reason: 'foreground-check-failed' };
    }
  }

  if (action === 'mouse_click' || action === 'keyboard_type') {
    try {
      const prompt = action === 'mouse_click'
        ? `Did a click likely happen near (${params?.x}, ${params?.y})? Briefly report if UI changed.`
        : 'Did recent typing likely appear in a focused input? Briefly report.';
      const vision = await analyzeScreen(prompt);
      if (!vision?.success) return { pass: false, reason: 'vision-failed' };
      const text = normalizeText(vision.analysis);
      const changed = /(changed|opened|typed|focused|selected|visible|dialog|menu|window)/.test(text);
      return { pass: changed, reason: changed ? 'vision-change-detected' : 'no-visible-change' };
    } catch {
      return { pass: false, reason: 'vision-check-error' };
    }
  }

  return { pass: true, reason: 'default-pass' };
}

module.exports = {
  verifyActionOutcome,
};
