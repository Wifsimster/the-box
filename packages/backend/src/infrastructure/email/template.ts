/**
 * Shared visual identity for every transactional and marketing email
 * the app sends. Keeps the dark gaming look (deep purple background,
 * neon eyebrow, purple→pink gradient CTA) consistent across the
 * password-reset / verification flows, the daily nudges, and the
 * admin test mail. Inline styles only — most clients still strip
 * <style> tags.
 */

const STYLE = {
  outer: 'background:#0b0612;padding:24px 0;font-family:-apple-system,Segoe UI,Arial,sans-serif;',
  card:
    'max-width:560px;margin:0 auto;background:#140a26;border:1px solid #2a1644;border-radius:14px;padding:32px 28px;color:#ece8f5;',
  eyebrow:
    'font-size:13px;letter-spacing:2px;color:#c084fc;text-transform:uppercase;margin-bottom:8px;',
  h1: 'margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;',
  paragraph: 'margin:0 0 14px;font-size:15px;line-height:1.55;color:#cfc6e6;',
  ctaWrap: 'text-align:center;margin:28px 0;',
  cta:
    'display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#a855f7,#ec4899);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;',
  tip: 'margin:0;font-size:12px;line-height:1.5;color:#7a6f93;',
  hr: 'margin:28px 0 16px;border:none;border-top:1px solid #2a1644;',
  footer: 'margin:0;font-size:11px;color:#6b6189;line-height:1.5;',
  footerLink: 'color:#a78bfa;',
} as const

export const EMAIL_STYLE = STYLE

export interface RenderEmailInput {
  /** Small uppercase label rendered above the heading. Defaults to "The Box". */
  eyebrow?: string
  heading: string
  /** Body paragraphs. May contain inline HTML (`<strong>`, `<em>`, `<a>`). */
  paragraphs?: string[]
  /** Raw HTML inserted before the CTA — useful for inline reward boxes. */
  beforeCtaHtml?: string
  cta?: { label: string; url: string }
  /** Tip / small text below the CTA. */
  tip?: string
  /** Footer HTML rendered after the divider (unsubscribe, link expiry…). */
  footerHtml?: string
}

function renderParagraph(html: string): string {
  return `<p style="${STYLE.paragraph}">${html}</p>`
}

export function renderEmailHtml(input: RenderEmailInput): string {
  const eyebrow = input.eyebrow ?? 'The Box'
  const paragraphs = (input.paragraphs ?? []).map(renderParagraph).join('')
  const beforeCta = input.beforeCtaHtml ?? ''
  const cta = input.cta
    ? `<div style="${STYLE.ctaWrap}"><a href="${input.cta.url}" style="${STYLE.cta}">${input.cta.label}</a></div>`
    : ''
  const tip = input.tip ? `<p style="${STYLE.tip}">${input.tip}</p>` : ''
  const footer = input.footerHtml
    ? `<hr style="${STYLE.hr}" /><p style="${STYLE.footer}">${input.footerHtml}</p>`
    : ''

  return `
    <div style="${STYLE.outer}">
      <div style="${STYLE.card}">
        <div style="${STYLE.eyebrow}">${eyebrow}</div>
        <h1 style="${STYLE.h1}">${input.heading}</h1>
        ${paragraphs}
        ${beforeCta}
        ${cta}
        ${tip}
        ${footer}
      </div>
    </div>
  `
}

const TAG_RE = /<[^>]+>/g

function stripTags(html: string): string {
  return html.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
}

export interface RenderEmailTextInput {
  heading: string
  paragraphs?: string[]
  cta?: { label: string; url: string }
  tip?: string
  footerLines?: string[]
}

/**
 * Plain-text counterpart for clients that block HTML. Mirrors the HTML
 * render order: heading, body paragraphs, CTA URL, tip, footer.
 */
export function renderEmailText(input: RenderEmailTextInput): string {
  const lines: string[] = []
  lines.push(stripTags(input.heading))
  lines.push('')
  for (const p of input.paragraphs ?? []) {
    lines.push(stripTags(p))
    lines.push('')
  }
  if (input.cta) {
    lines.push(`${input.cta.label} : ${input.cta.url}`)
    lines.push('')
  }
  if (input.tip) {
    lines.push(stripTags(input.tip))
    lines.push('')
  }
  for (const f of input.footerLines ?? []) {
    lines.push(stripTags(f))
  }
  lines.push('— The Box')
  return lines.join('\n')
}
