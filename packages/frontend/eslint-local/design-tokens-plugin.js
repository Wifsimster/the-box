import noRawDesignTokens from './no-raw-design-tokens.js'

// Oxlint JS plugin wrapper for the local design-token rule.
export default {
  meta: { name: 'design-tokens' },
  rules: {
    'no-raw-design-tokens': noRawDesignTokens,
  },
}
