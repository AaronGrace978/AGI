import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // ─── Global ignores ──────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'scripts/**',
      'electron/**',
      'environment_files/**',
      'Memory/**',
      'AGIPRIME/**',
      'AGIPrime-Mobile/**',
      'AGIPrime Documents/**',
      'Demos/**',
      '*.js',
      '*.cjs',
      '*.mjs',
    ],
  },

  // ─── Base JS recommended ─────────────────────────────────────
  js.configs.recommended,

  // ─── TypeScript recommended ──────────────────────────────────
  ...tseslint.configs.recommended,

  // ─── Source files config ─────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React refresh (Vite HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TypeScript — practical, not pedantic
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',

      // General
      'no-console': 'off',
      'no-debugger': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['warn', 'smart'],
      'no-throw-literal': 'error',
      'no-constant-binary-expression': 'error',
    },
  },

  // ─── Test files — relaxed ────────────────────────────────────
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-throw-literal': 'off',
    },
  },

  // ─── Prettier must be last (disables conflicting rules) ──────
  eslintConfigPrettier,
);
