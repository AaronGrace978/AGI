function makeActionContractRegistry() {
  const registry = new Map();

  function register(contract) {
    if (!contract || typeof contract.action !== 'string') return;
    registry.set(contract.action, contract);
  }

  function get(action) {
    return registry.get(action) || null;
  }

  function list() {
    return [...registry.keys()];
  }

  return { register, get, list };
}

function defaultRetryPolicy(action) {
  if (action === 'analyze_screen' || action === 'execute_command') {
    return { maxAttempts: 2, delayMs: 350 };
  }
  if (action === 'mouse_click' || action === 'keyboard_type') {
    return { maxAttempts: 2, delayMs: 180 };
  }
  return { maxAttempts: 1, delayMs: 0 };
}

module.exports = {
  makeActionContractRegistry,
  defaultRetryPolicy,
};
