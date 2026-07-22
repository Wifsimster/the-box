/**
 * ESLint rule: no-raw-design-tokens
 *
 * Enforces the UI token contract documented in docs/ui-tokens.md:
 *   1. No raw color literals (`rgba(`, `oklch(`, `hsl(`, `#RRGGBB[AA]`)
 *      in component source — they must live in src/index.css as tokens.
 *   2. No Tailwind palette utilities for color channels (`bg-red-500`,
 *      `text-amber-400`, `border-cyan-600`, `from-green-500`, etc.) —
 *      use semantic tokens (bg-primary, text-success, border-warning...).
 *   3. No Tailwind arbitrary values that inline raw colors:
 *      `shadow-[0_0_20px_rgba(...)]` is forbidden;
 *      `shadow-[var(--glow-md)]` is allowed.
 *
 * Applies to string literals, template-literal quasis and JSX attribute
 * string values. Off by default — callers opt in per glob in
 * eslint.config.js.
 */

const HEX_COLOR_RE = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/
// NB: a leading `\b` here would MISS the most common offender —
// `shadow-[0_0_20px_rgba(...)]` — because Tailwind joins arbitrary-value
// tokens with `_`, and `_` is a word char, so there is no word boundary
// between `_` and `rgba`. Use a negative lookbehind that only rejects an
// alphabetic prefix (so `bgcolor(` stays un-matched) while still catching
// the function after `_`, `(`, `,` or whitespace.
const RAW_COLOR_FN_RE = /(?<![a-zA-Z])(?:rgba?|oklch|oklab|hsla?|color)\(/
const PALETTE_CLASS_RE = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|divide|placeholder|caret|accent|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/g
const ARBITRARY_CLASS_RE = /\b(?:bg|text|border|ring|shadow|from|to|via|fill|stroke|decoration|outline)-\[([^[\]]+)\]/g
const VAR_RE = /\bvar\(--/

function containsRawColor(value) {
  return RAW_COLOR_FN_RE.test(value) || HEX_COLOR_RE.test(value)
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw color literals and un-tokenized Tailwind arbitrary values (see docs/ui-tokens.md).',
    },
    messages: {
      rawColor:
        "Raw color literal '{{match}}' is not allowed. Add a CSS variable to src/index.css and reference it via var(--*). See docs/ui-tokens.md.",
      paletteClass:
        "Tailwind palette class '{{match}}' bypasses the design tokens. Use a semantic token instead (bg-primary, text-success, border-warning, text-neon-*). See docs/ui-tokens.md.",
      arbitraryColor:
        "Arbitrary Tailwind value '{{match}}' inlines a raw color. Reference a token (e.g. shadow-[var(--glow-md)]). See docs/ui-tokens.md.",
    },
    schema: [],
  },
  create(context) {
    function check(node, value) {
      if (!value || typeof value !== 'string') return

      // 1. Raw color functions / hex literals anywhere in the string.
      //    Skip matches that are inside var(--...) references — those
      //    are token expressions, not raw colors.
      if (containsRawColor(value) && !VAR_RE.test(value)) {
        const fn = value.match(RAW_COLOR_FN_RE)
        const hex = value.match(HEX_COLOR_RE)
        const match = fn ? fn[0] : hex ? hex[0] : value
        context.report({ node, messageId: 'rawColor', data: { match } })
      }

      // 2. Tailwind palette color classes.
      let paletteMatch
      PALETTE_CLASS_RE.lastIndex = 0
      while ((paletteMatch = PALETTE_CLASS_RE.exec(value)) !== null) {
        context.report({
          node,
          messageId: 'paletteClass',
          data: { match: paletteMatch[0] },
        })
      }

      // 3. Arbitrary Tailwind values with raw color content.
      let arbMatch
      ARBITRARY_CLASS_RE.lastIndex = 0
      while ((arbMatch = ARBITRARY_CLASS_RE.exec(value)) !== null) {
        const inner = arbMatch[1]
        if (containsRawColor(inner) && !VAR_RE.test(inner)) {
          context.report({
            node,
            messageId: 'arbitraryColor',
            data: { match: arbMatch[0] },
          })
        }
      }
    }

    return {
      Literal(node) {
        // JSXAttribute string values also visit here; skip to avoid
        // double-reporting (JSXAttribute visitor handles the same node).
        if (node.parent && node.parent.type === 'JSXAttribute') return
        if (typeof node.value === 'string') check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value && node.value.cooked)
      },
      JSXAttribute(node) {
        if (
          node.value &&
          node.value.type === 'Literal' &&
          typeof node.value.value === 'string'
        ) {
          check(node.value, node.value.value)
        }
      },
    }
  },
}
