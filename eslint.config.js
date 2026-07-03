const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
    },
  },
  {
    // TypeScript itself checks for undefined names (with type information,
    // which eslint doesn't have) — no-undef only produces false positives here.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
        node: true,
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.webpack/**',
      'out/**',
      'old/**',
      'generated_assets/**',
      '.agent-browser/**',
    ],
  },
];

