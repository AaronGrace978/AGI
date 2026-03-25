// Load .env from project root — SAME paths as desktop (electron/main.js)
const path = require('path');
try {
  const dotenv = require('dotenv');
  const envPaths = [
    path.join(__dirname, '..', '.env'),   // AGIPrime-Mobile/.. = project root
    path.join(process.cwd(), '.env'),
  ];
  for (const envPath of envPaths) {
    const r = dotenv.config({ path: envPath });
    if (!r.error) break;
  }
} catch (e) {
  // dotenv not installed or load failed
}

module.exports = {
  expo: {
    name: 'AGI Prime',
    slug: 'agiprime-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    scheme: 'agiprime',
    splash: { backgroundColor: '#0a0a0f' },
    ios: { supportsTablet: true, bundleIdentifier: 'com.agiprime.mobile' },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0a0a0f',
      },
      package: 'com.agiprime.mobile',
      navigationBarColor: '#0a0a0f',
      navigationBarStyle: 'light-content',
    },
    androidStatusBar: {
      barStyle: 'light-content',
      backgroundColor: '#00000000',
      translucent: true,
    },
    androidNavigationBar: {
      visible: 'sticky-immersive',
      backgroundColor: '#0a0a0f',
      barStyle: 'light-content',
    },
    plugins: [
      'expo-router',
      [
        'expo-speech-recognition',
        {
          microphonePermission: 'Allow AGI Prime to use the microphone for voice input.',
          speechRecognitionPermission: 'Allow AGI Prime to use speech recognition.',
        },
      ],
    ],
    extra: {
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://ollama.com',
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY_DESKTOP || '',
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen3-coder:480b-cloud',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      ARC_API_KEY: process.env.ARC_API_KEY || process.env.ARC_AGI_API || '',
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
      ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || 'FOfJ2PMgU6HOGbNYnzto',
      ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      SOUNDPRIME_URL: process.env.SOUNDPRIME_URL || 'http://127.0.0.1:8080',
    },
  },
};
