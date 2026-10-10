// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out', 'dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'tests/**/*.ts', '*.config.mts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Three.js objects are imperative by design: R3F code mutates memoized meshes, bones and
    // mixers inside useFrame. The React Compiler immutability rule cannot model that.
    files: ['src/renderer/src/scene/**/*.{ts,tsx}', 'src/renderer/src/characters/**/*.{ts,tsx}'],
    rules: { 'react-hooks/immutability': 'off' },
  },
  {
    // Layering: shared must stay free of Electron/Node/Three; renderer must not reach into main.
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', 'node:*', 'three', '@react-three/*', 'react', '../../../src/*'] },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['electron', 'node:*', '**/main/**', '**/preload/**'] },
      ],
    },
  },
)
