import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import noRawDesignTokens from './eslint-local/no-raw-design-tokens.js'

const designTokensPlugin = {
  rules: {
    'no-raw-design-tokens': noRawDesignTokens,
  },
}

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'design-tokens': designTokensPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Design-token enforcement — error severity across the entire src/**
  // surface. The only opt-out is components/backgrounds/**, which hosts
  // three.js materials that legitimately require raw hex colors (meshBasicMaterial
  // color props etc.). Every other file, including Framer Motion presets in
  // lib/animations.ts, must reference tokens via var(--*).
  //
  // The migration that led here is tracked in docs/ui-tokens.md and
  // commits on the claude/shadcn-ui-planning-NmKn3 branch.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/backgrounds/**'],
    rules: {
      'design-tokens/no-raw-design-tokens': 'error',
    },
  },
]
