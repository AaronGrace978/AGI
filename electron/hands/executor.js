const { makeDirectControlRouter } = require('./matrix-parity');

async function executeSingleAction(action, params, deps) {
  const {
    executeIPC,
    analyzeScreen,
    neuralEnhanceAction,
    steps,
  } = deps;
  const directControl = makeDirectControlRouter({ executeIPC });

  switch (action) {
    case 'execute_command':
      return await executeIPC('agent:execute', params.command);
    case 'read_file':
      return await executeIPC('agent:readFile', params.path);
    case 'write_file':
      return await executeIPC('agent:writeFile', params.path, params.content);
    case 'list_directory':
      return await executeIPC('agent:listDir', params.path);
    case 'create_directory':
      return await executeIPC('agent:createDir', params.path);
    case 'delete_file':
      return await executeIPC('agent:deleteFile', params.path);
    case 'rename_file':
      return await executeIPC('agent:renameFile', params.oldPath, params.newPath);
    case 'open_url':
      return await executeIPC('agent:openUrl', params.url);
    case 'open_application':
      return await directControl.openApplication(params);
    case 'open_file':
      return await executeIPC('agent:openFile', params.path);
    case 'search_files':
      return await executeIPC('agent:searchFiles', params.directory, params.pattern);
    case 'clipboard_read':
      return await executeIPC('agent:clipboard', 'read');
    case 'clipboard_write':
      return await executeIPC('agent:clipboard', 'write', params.text);
    case 'system_info':
      return await executeIPC('agent:systemDetails');
    case 'list_processes':
      return await executeIPC('agent:listProcesses');
    case 'web_fetch':
      return await executeIPC('agent:webFetch', params.url, params);
    case 'web_search':
      return await executeIPC('agent:webSearch', params.query);
    case 'web_screenshot':
      return await executeIPC('agent:webScreenshot', params.url);
    case 'elevenlabs_tts':
      return await executeIPC('agent:elevenlabsTts', params.text, params);
    case 'elevenlabs_generate_music':
      return await executeIPC('agent:elevenlabsGenerateMusic', params.prompt, params);
    case 'screenshot_desktop': {
      const r = await analyzeScreen('Describe everything visible on the screen. Identify all windows, text, UI elements, and their approximate pixel coordinates.');
      return r.success ? { success: true, output: r.analysis } : r;
    }
    case 'analyze_screen': {
      const r = await analyzeScreen(params.prompt || 'Describe what you see on the screen.');
      return r.success ? { success: true, output: r.analysis } : r;
    }
    case 'get_screen_dimensions':
      return await executeIPC('agent:getScreenDimensions');
    case 'get_foreground_window':
      return await executeIPC('agent:getForegroundWindow');
    case 'mouse_move': {
      const nm = await neuralEnhanceAction('mouse_move', params, steps);
      const mp = nm || params;
      return await executeIPC('agent:mouseMove', mp.x, mp.y, mp.smooth !== false);
    }
    case 'mouse_click': {
      const nc = await neuralEnhanceAction('mouse_click', params, steps);
      const cp = nc || params;
      if (cp._neuralTimingMs) await new Promise((r) => setTimeout(r, Math.min(cp._neuralTimingMs, 500)));
      return await executeIPC('agent:mouseClick', cp.x, cp.y, cp.button, cp.doubleClick);
    }
    case 'mouse_scroll':
      return await executeIPC('agent:mouseScroll', params.x, params.y, params.amount);
    case 'mouse_drag': {
      const nd = await neuralEnhanceAction('mouse_drag', params, steps);
      const dp = nd || params;
      return await executeIPC('agent:mouseDrag', dp.fromX, dp.fromY, dp.toX, dp.toY);
    }
    case 'keyboard_type':
      return await executeIPC('agent:keyboardType', params.text);
    case 'keyboard_press':
      return await executeIPC('agent:keyboardPress', params.key);
    case 'keyboard_shortcut':
      return await executeIPC('agent:keyboardShortcut', params.modifiers, params.key);
    case 'get_mouse_position':
      return await executeIPC('agent:getMousePosition');
    case 'minimize_self':
      return await executeIPC('agent:minimizeSelf');
    case 'create_tool':
      return await executeIPC('agent:createTool', params);
    case 'list_custom_tools':
      return await executeIPC('agent:listTools');
    case 'execute_tool':
      return await executeIPC('agent:executeTool', params.toolId, params);
    case 'neural_status':
      return await executeIPC('neural:status');
    case 'neural_predict':
      return await executeIPC('neural:predict', params);
    case 'neural_train':
      return await executeIPC('neural:train', params);
    case 'neural_model_stats':
      return await executeIPC('neural:modelStats');
    case 'neural_generate_trajectory':
      return await executeIPC('neural:generateTrajectory', params);
    case 'neural_plan':
      return await executeIPC('neural:plan', params);
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

module.exports = {
  executeSingleAction,
};
