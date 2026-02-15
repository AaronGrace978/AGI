// ═══════════════════════════════════════════════════════════════
//  Settings Panel — Configuration of the AGI Mind
//  Provider selection, model config, consciousness tuning
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '../store';

// ─── All Ollama Cloud models (https://ollama.com/search?c=cloud) ────
const OLLAMA_CLOUD_MODELS = [
  // Coding / Agentic
  { name: 'qwen3-coder-next:cloud', label: 'Qwen3-Coder-Next (Cloud)' },
  { name: 'qwen3-coder:480b-cloud', label: 'Qwen3-Coder 480B (Cloud)' },
  { name: 'devstral-2:cloud', label: 'Devstral 2 123B (Cloud)' },
  { name: 'devstral-small-2:cloud', label: 'Devstral Small 2 24B (Cloud)' },
  // Frontier Reasoning
  { name: 'glm-5:cloud', label: 'GLM-5 744B (Cloud)' },
  { name: 'glm-4.7:cloud', label: 'GLM-4.7 (Cloud)' },
  { name: 'glm-4.6:cloud', label: 'GLM-4.6 (Cloud)' },
  { name: 'deepseek-v3.1:cloud', label: 'DeepSeek V3.1 671B (Cloud)' },
  { name: 'deepseek-v3.2:cloud', label: 'DeepSeek V3.2 (Cloud)' },
  // Multimodal / Vision
  { name: 'kimi-k2.5:cloud', label: 'Kimi K2.5 (Cloud)' },
  { name: 'kimi-k2-thinking:cloud', label: 'Kimi K2 Thinking (Cloud)' },
  { name: 'qwen3-vl:cloud', label: 'Qwen3-VL (Cloud)' },
  // MiniMax
  { name: 'minimax-m2.5:cloud', label: 'MiniMax M2.5 (Cloud)' },
  { name: 'minimax-m2.1:cloud', label: 'MiniMax M2.1 (Cloud)' },
  { name: 'minimax-m2:cloud', label: 'MiniMax M2 (Cloud)' },
  // Reasoning / General
  { name: 'qwen3-next:80b-cloud', label: 'Qwen3-Next 80B (Cloud)' },
  { name: 'cogito-2.1:cloud', label: 'Cogito 2.1 671B (Cloud)' },
  { name: 'nemotron-3-nano:cloud', label: 'Nemotron 3 Nano 30B (Cloud)' },
  { name: 'gemini-3-flash-preview:cloud', label: 'Gemini 3 Flash Preview (Cloud)' },
  // Edge / Small
  { name: 'ministral-3:3b-cloud', label: 'Ministral 3 3B (Cloud)' },
  { name: 'ministral-3:8b-cloud', label: 'Ministral 3 8B (Cloud)' },
  { name: 'ministral-3:14b-cloud', label: 'Ministral 3 14B (Cloud)' },
  { name: 'rnj-1:8b-cloud', label: 'Rnj-1 8B (Cloud)' },
  // Fallback from .env
  { name: 'mistral-large-3:675b-cloud', label: 'Mistral Large 3 675B (Cloud)' },
];

// ─── Anthropic model list ───────────────────────────────────────
const ANTHROPIC_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
  'claude-3-5-haiku-20241022',
];

// ─── OpenAI model list ─────────────────────────────────────────
const OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
];

// ─── Model Dropdown (always populated) ─────────────────────────
function ModelDropdown({
  provider,
  localModel,
  setLocalModel,
  save,
  ollamaStatus,
}: {
  provider: string;
  localModel: string;
  setLocalModel: (v: string) => void;
  save: (overrides?: Record<string, unknown>) => void;
  ollamaStatus: { online: boolean; models: Array<{ name: string }> };
}) {
  // Build Ollama model list: cloud models + any fetched local/cloud models
  const ollamaModels = useMemo(() => {
    const cloudNames = new Set(OLLAMA_CLOUD_MODELS.map((m) => m.name));
    const merged: Array<{ name: string; label: string }> = [...OLLAMA_CLOUD_MODELS];

    // Add any fetched models that aren't already in the cloud list (e.g. local models)
    if (ollamaStatus.online && ollamaStatus.models.length > 0) {
      for (const m of ollamaStatus.models) {
        if (!cloudNames.has(m.name)) {
          merged.push({ name: m.name, label: m.name });
        }
      }
    }

    return merged;
  }, [ollamaStatus]);

  if (provider === 'ollama') {
    const allNames = ollamaModels.map((m) => m.name);
    const currentInList = allNames.includes(localModel);

    return (
      <div className="settings-row">
        <div className="settings-label">
          Model
          <small>All Ollama Cloud + local models</small>
        </div>
        <select
          className="settings-select"
          value={localModel}
          onChange={(e) => {
            setLocalModel(e.target.value);
            save({ model: e.target.value, provider: 'ollama' });
          }}
        >
          {!currentInList && localModel ? (
            <option value={localModel}>{localModel} (current)</option>
          ) : null}
          {ollamaStatus.online && ollamaStatus.models.length > 0 && (
            <optgroup label="Fetched Models">
              {ollamaStatus.models.map((m) => (
                <option key={`fetched-${m.name}`} value={m.name}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Ollama Cloud Models">
            {OLLAMA_CLOUD_MODELS.map((m) => (
              <option key={`cloud-${m.name}`} value={m.name}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    );
  }

  if (provider === 'anthropic') {
    return (
      <div className="settings-row">
        <div className="settings-label">
          Model
          <small>Anthropic Claude models</small>
        </div>
        <select
          className="settings-select"
          value={localModel}
          onChange={(e) => {
            setLocalModel(e.target.value);
            save({ model: e.target.value });
          }}
        >
          {ANTHROPIC_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {localModel && !ANTHROPIC_MODELS.includes(localModel) && (
            <option value={localModel}>{localModel} (current)</option>
          )}
        </select>
      </div>
    );
  }

  if (provider === 'openai') {
    return (
      <div className="settings-row">
        <div className="settings-label">
          Model
          <small>OpenAI GPT models</small>
        </div>
        <select
          className="settings-select"
          value={localModel}
          onChange={(e) => {
            setLocalModel(e.target.value);
            save({ model: e.target.value });
          }}
        >
          {OPENAI_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {localModel && !OPENAI_MODELS.includes(localModel) && (
            <option value={localModel}>{localModel} (current)</option>
          )}
        </select>
      </div>
    );
  }

  return (
    <div className="settings-row">
      <div className="settings-label">
        Model
        <small>Enter model name</small>
      </div>
      <input
        className="settings-input"
        value={localModel}
        onChange={(e) => setLocalModel(e.target.value)}
        onBlur={() => save()}
        placeholder="e.g. llama3.2"
      />
    </div>
  );
}

export default function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const ollamaStatus = useStore((s) => s.ollamaStatus);
  const updateSettings = useStore((s) => s.updateSettings);
  const checkOllama = useStore((s) => s.checkOllama);
  const consciousness = useStore((s) => s.consciousness);
  const dualBrain = useStore((s) => s.dualBrain);
  const setDualBrainEnabled = useStore((s) => s.setDualBrainEnabled);
  const setDualBrainThresholds = useStore((s) => s.setDualBrainThresholds);
  const forge = useStore((s) => s.forge);
  const setForgeStrictEvalMode = useStore((s) => s.setForgeStrictEvalMode);
  const setForgeVerifierFirst = useStore((s) => s.setForgeVerifierFirst);
  const memoryConsolidation = useStore((s) => s.memoryConsolidation);

  const [localModel, setLocalModel] = useState(settings.model);
  const [localUrl, setLocalUrl] = useState(settings.ollamaUrl);
  const [localAnthropicKey, setLocalAnthropicKey] = useState(settings.anthropicKey);
  const [localOpenaiKey, setLocalOpenaiKey] = useState(settings.openaiKey);
  const [localTemp, setLocalTemp] = useState(settings.temperature);
  const [localMaxTokens, setLocalMaxTokens] = useState(settings.maxTokens);
  const [localSystemPrompt, setLocalSystemPrompt] = useState(settings.systemPrompt);

  // Sync when settings load
  useEffect(() => {
    setLocalModel(settings.model);
    setLocalUrl(settings.ollamaUrl);
    setLocalAnthropicKey(settings.anthropicKey);
    setLocalOpenaiKey(settings.openaiKey);
    setLocalTemp(settings.temperature);
    setLocalMaxTokens(settings.maxTokens);
    setLocalSystemPrompt(settings.systemPrompt);
  }, [settings]);

  const save = (overrides: Record<string, unknown> = {}) => {
    updateSettings({
      model: localModel,
      ollamaUrl: localUrl,
      anthropicKey: localAnthropicKey,
      openaiKey: localOpenaiKey,
      temperature: localTemp,
      maxTokens: localMaxTokens,
      systemPrompt: localSystemPrompt,
      ...overrides,
    });
  };

  return (
    <div className="settings-panel">
      <h2>⚙ SETTINGS</h2>

      {/* Ollama Status */}
      <div className={`ollama-status ${ollamaStatus.online ? 'online' : 'offline'}`}>
        <div className="ollama-status-dot" />
        {ollamaStatus.online
          ? `Ollama connected — ${ollamaStatus.models.length} model${ollamaStatus.models.length !== 1 ? 's' : ''}`
          : 'Ollama not detected'}
        <button
          onClick={() => checkOllama()}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: '1px solid var(--border-dim)',
            color: 'var(--text-dim)',
            padding: '3px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
          }}
        >
          REFRESH
        </button>
      </div>

      {/* Provider Selection */}
      <div className="settings-section" style={{ marginTop: 16 }}>
        <div className="settings-section-title">AI PROVIDER</div>
        <div className="settings-row">
          <div className="settings-label">
            Provider
            <small>Which AI service powers the mind</small>
          </div>
          <select
            className="settings-select"
            value={settings.provider}
            onChange={(e) => {
              const provider = e.target.value as 'ollama' | 'anthropic' | 'openai';
              updateSettings({ provider });
            }}
          >
            <option value="ollama">Ollama (Local or Cloud)</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
          </select>
        </div>

        <ModelDropdown
          provider={settings.provider}
          localModel={localModel}
          setLocalModel={setLocalModel}
          save={save}
          ollamaStatus={ollamaStatus}
        />

        {settings.provider === 'ollama' && (
          <div className="settings-row">
            <div className="settings-label">
              Ollama URL
              <small>Local: http://localhost:11434 — Cloud: https://ollama.com (set OLLAMA_API_KEY in .env)</small>
            </div>
            <input
              className="settings-input"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              onBlur={() => {
                save();
                checkOllama();
              }}
              placeholder="http://localhost:11434 or https://ollama.com"
            />
          </div>
        )}

        {settings.provider === 'anthropic' && (
          <div className="settings-row">
            <div className="settings-label">
              API Key
              <small>Your Anthropic API key</small>
            </div>
            <input
              className="settings-input"
              type="password"
              value={localAnthropicKey}
              onChange={(e) => setLocalAnthropicKey(e.target.value)}
              onBlur={() => save()}
              placeholder="sk-ant-..."
            />
          </div>
        )}

        {settings.provider === 'openai' && (
          <div className="settings-row">
            <div className="settings-label">
              API Key
              <small>Your OpenAI API key</small>
            </div>
            <input
              className="settings-input"
              type="password"
              value={localOpenaiKey}
              onChange={(e) => setLocalOpenaiKey(e.target.value)}
              onBlur={() => save()}
              placeholder="sk-..."
            />
          </div>
        )}
      </div>

      {/* Generation Parameters */}
      <div className="settings-section">
        <div className="settings-section-title">GENERATION</div>
        <div className="settings-row">
          <div className="settings-label">Temperature</div>
          <div className="settings-slider-row">
            <input
              className="settings-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={localTemp}
              onChange={(e) => setLocalTemp(parseFloat(e.target.value))}
              onMouseUp={() => save()}
            />
            <span className="settings-slider-value">{localTemp.toFixed(2)}</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">Max Tokens</div>
          <input
            className="settings-input"
            type="number"
            value={localMaxTokens}
            onChange={(e) => setLocalMaxTokens(parseInt(e.target.value) || 4096)}
            onBlur={() => save()}
            style={{ width: 120, minWidth: 'auto' }}
          />
        </div>
      </div>

      {/* System Prompt */}
      <div className="settings-section">
        <div className="settings-section-title">CONSCIOUSNESS PROMPT</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
          The core system prompt that defines AGI PRIME's personality and behavior.
          Leave blank for default consciousness.
        </div>
        <textarea
          className="settings-textarea"
          value={localSystemPrompt}
          onChange={(e) => setLocalSystemPrompt(e.target.value)}
          onBlur={() => save()}
          placeholder="Custom system prompt (leave blank for default AGI PRIME consciousness)..."
          rows={5}
        />
      </div>

      {/* Soul Status */}
      <div className="settings-section">
        <div className="settings-section-title">AUTONOMY CONTROLS</div>
        <div className="settings-row">
          <div className="settings-label">
            Dual-Brain Router
            <small>Fast path for simple tasks, slow path for complex/uncertain tasks</small>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={dualBrain.enabled}
              onChange={(e) => setDualBrainEnabled(e.target.checked)}
            />
            Enabled
          </label>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            Complexity Threshold
            <small>Escalate to slow brain when complexity exceeds this level</small>
          </div>
          <div className="settings-slider-row">
            <input
              className="settings-slider"
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={dualBrain.complexityThreshold}
              onChange={(e) =>
                setDualBrainThresholds(parseFloat(e.target.value), dualBrain.uncertaintyThreshold)
              }
            />
            <span className="settings-slider-value">{dualBrain.complexityThreshold.toFixed(2)}</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            Uncertainty Threshold
            <small>Escalate to slow brain for novelty or uncertainty</small>
          </div>
          <div className="settings-slider-row">
            <input
              className="settings-slider"
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={dualBrain.uncertaintyThreshold}
              onChange={(e) =>
                setDualBrainThresholds(dualBrain.complexityThreshold, parseFloat(e.target.value))
              }
            />
            <span className="settings-slider-value">{dualBrain.uncertaintyThreshold.toFixed(2)}</span>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-label">
            Strict Eval + Verifier First
            <small>Require stronger evidence before scoring success</small>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={forge.strictEvalMode}
                onChange={(e) => setForgeStrictEvalMode(e.target.checked)}
              />
              Strict Eval
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={forge.verifierFirst}
                onChange={(e) => setForgeVerifierFirst(e.target.checked)}
              />
              Verifier-First
            </label>
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
          Memory consolidation runs: {memoryConsolidation.totalRuns} · pending episodes: {memoryConsolidation.pendingEpisodes.length}
        </div>
      </div>

      {/* Soul Status */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ color: 'var(--magenta)' }}>
          SOUL STATUS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>NAME</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{consciousness.name}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>CURRENT EMOTION</div>
            <div style={{ fontSize: 13, color: 'var(--magenta)', marginTop: 2 }}>{consciousness.soulFrame.currentEmotion}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>PRESENCE</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{consciousness.presence}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>TOTAL INTERACTIONS</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{consciousness.totalInteractions}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
