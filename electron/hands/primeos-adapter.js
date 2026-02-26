const fs = require('fs');
const path = require('path');

function exportPrimeOSRuntimeBundle({ outputDir, runtimeControls, profile, version = 'v2' }) {
  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = {
    exportedAt: Date.now(),
    version,
    profile: String(profile || 'sovereign-desktop'),
    runtimeControls: { ...(runtimeControls || {}) },
    promotionTarget: 'AGI PrimeOS Agent Layer',
  };
  const filePath = path.join(dir, `hands-runtime-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return { filePath, payload };
}

module.exports = {
  exportPrimeOSRuntimeBundle,
};
