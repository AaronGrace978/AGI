function normalizeAppAlias(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (!v) return '';
  if (v === 'notepad' || v === 'notepad.exe') return 'notepad.exe';
  if (v === 'calc' || v === 'calculator') return 'calc.exe';
  if (v === 'explorer' || v === 'file explorer') return 'explorer.exe';
  if (v === 'powershell' || v === 'pwsh') return 'powershell.exe';
  if (v === 'cmd' || v === 'command prompt') return 'cmd.exe';
  return raw;
}

function makeDirectControlRouter({ executeIPC }) {
  return {
    async openApplication(params) {
      const candidate = params?.appPath || params?.path || params?.application || '';
      const normalized = normalizeAppAlias(candidate);
      return executeIPC('agent:openApp', normalized);
    },
  };
}

module.exports = {
  normalizeAppAlias,
  makeDirectControlRouter,
};
