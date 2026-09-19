// ═══════════════════════════════════════════════════════════════
//  Host platform helpers (Windows / macOS / Linux / Steam Deck)
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const os = require('os');

function detectSteamDeck() {
  if (process.env.STEAMDECK === '1' || process.env.SteamDeck === '1') return true;
  if (/steamdeck/i.test(String(process.env.XDG_CURRENT_DESKTOP || ''))) return true;
  try {
    const text = fs.readFileSync('/etc/os-release', 'utf8');
    if (/steamdeck|steamos/i.test(text)) return true;
  } catch {
    /* not Linux or unreadable */
  }
  try {
    const board = fs.readFileSync('/sys/devices/virtual/dmi/id/board_name', 'utf8').trim();
    // Jupiter = LCD, Galileo = OLED
    if (/Jupiter|Galileo/i.test(board)) return true;
  } catch {
    /* not Steam Deck hardware */
  }
  return false;
}

function hostLabel() {
  if (detectSteamDeck()) return 'Steam Deck';
  if (process.platform === 'darwin') {
    return os.arch() === 'arm64' ? 'macOS (Apple Silicon)' : 'macOS (Intel)';
  }
  if (process.platform === 'win32') return 'Windows';
  if (process.platform === 'linux') return 'Linux';
  return process.platform;
}

module.exports = { detectSteamDeck, hostLabel };
