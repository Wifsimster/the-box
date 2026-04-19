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

  // Design-token enforcement — staged by area.
  //
  // "error" for areas already migrated in Sprints 1-3 (game, daily-login,
  // achievement, ui primitives) — regressions must fail CI.
  // "warn" elsewhere in src/** so legacy code surfaces nudges without
  // breaking the build; each follow-up sprint promotes another glob.
  //
  // Opted out:
  //   - components/backgrounds/** — three.js materials need raw hex colors.
  //   - lib/animations.ts — Framer Motion animation presets; a dedicated
  //     pass will move these to tokens in a future sprint.
  {
    files: [
      'src/components/game/**/*.{ts,tsx}',
      'src/components/daily-login/**/*.{ts,tsx}',
      'src/components/achievement/**/*.{ts,tsx}',
      'src/components/admin/**/*.{ts,tsx}',
      'src/components/profile/**/*.{ts,tsx}',
      'src/components/layout/**/*.{ts,tsx}',
      'src/components/ui/**/*.{ts,tsx}',
      'src/pages/**/*.{ts,tsx}',
    ],
    rules: {
      'design-tokens/no-raw-design-tokens': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/components/game/**',
      'src/components/daily-login/**',
      'src/components/achievement/**',
      'src/components/admin/**',
      'src/components/profile/**',
      'src/components/layout/**',
      'src/components/ui/**',
      'src/components/backgrounds/**',
      'src/pages/**',
      'src/lib/animations.ts',
    ],
    rules: {
      'design-tokens/no-raw-design-tokens': 'warn',
    },
  },
]
