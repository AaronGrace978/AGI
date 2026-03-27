/**
 * Reads .env-backed config from Expo extra.
 * Keep fallback values non-sensitive and expose which keys were explicitly set.
 */
import Constants from 'expo-constants';

const extra = (Constants.expoConfig as any)?.extra ?? {};

const read = (key: string): string => {
  const value = extra[key];
  return typeof value === 'string' ? value.trim() : '';
};

const withDefault = (value: string, fallback: string): string => (value || fallback);

export const env = {
  OLLAMA_URL: withDefault(read('OLLAMA_URL'), 'https://ollama.com'),
  OLLAMA_API_KEY: read('OLLAMA_API_KEY'),
  OLLAMA_MODEL: withDefault(read('OLLAMA_MODEL'), 'qwen3-coder:480b-cloud'),
  ANTHROPIC_API_KEY: read('ANTHROPIC_API_KEY'),
  OPENAI_API_KEY: read('OPENAI_API_KEY'),
  ARC_API_KEY: read('ARC_API_KEY'),
  ELEVENLABS_API_KEY: read('ELEVENLABS_API_KEY'),
  ELEVENLABS_VOICE_ID: withDefault(read('ELEVENLABS_VOICE_ID'), 'FOfJ2PMgU6HOGbNYnzto'),
  ELEVENLABS_MODEL_ID: withDefault(read('ELEVENLABS_MODEL_ID'), 'eleven_multilingual_v2'),
  SOUNDPRIME_URL: withDefault(read('SOUNDPRIME_URL'), 'http://127.0.0.1:8080'),
};

export const envOverrides = {
  OLLAMA_URL: !!read('OLLAMA_URL'),
  OLLAMA_API_KEY: !!read('OLLAMA_API_KEY'),
  OLLAMA_MODEL: !!read('OLLAMA_MODEL'),
  ANTHROPIC_API_KEY: !!read('ANTHROPIC_API_KEY'),
  OPENAI_API_KEY: !!read('OPENAI_API_KEY'),
  ARC_API_KEY: !!read('ARC_API_KEY'),
  ELEVENLABS_API_KEY: !!read('ELEVENLABS_API_KEY'),
  ELEVENLABS_VOICE_ID: !!read('ELEVENLABS_VOICE_ID'),
  ELEVENLABS_MODEL_ID: !!read('ELEVENLABS_MODEL_ID'),
  SOUNDPRIME_URL: !!read('SOUNDPRIME_URL'),
};
