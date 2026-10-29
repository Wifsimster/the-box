const HEX_COLOR_RE = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/
const RAW_COLOR_FN_RE = /(?<![a-zA-Z])(?:rgba?|oklch|oklab|hsla?|color)\(/
const PALETTE_CLASS_RE = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|divide|placeholder|caret|accent|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/g
const ARBITRARY_CLASS_RE = /\b(?:bg|text|border|ring|shadow|from|to|via|fill|stroke|decoration|outline)-\[([^[\]]+)\]/g
const VAR_RE = /\bvar\(--/

function containsRawColor(value) {
  return RAW_COLOR_FN_RE.test(value) || HEX_COLOR_RE.test(value)
}

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

      if (containsRawColor(value) && !VAR_RE.test(value)) {
        const fn = value.match(RAW_COLOR_FN_RE)
        const hex = value.match(HEX_COLOR_RE)
        const match = fn ? fn[0] : hex ? hex[0] : value
        context.report({ node, messageId: 'rawColor', data: { match } })
      }

      let paletteMatch
      PALETTE_CLASS_RE.lastIndex = 0
      while ((paletteMatch = PALETTE_CLASS_RE.exec(value)) !== null) {
        context.report({
          node,
          messageId: 'paletteClass',
          data: { match: paletteMatch[0] },
        })
      }

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
