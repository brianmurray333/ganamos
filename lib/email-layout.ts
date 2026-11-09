/**
 * Shared layout for user-facing Ganamos emails (modelled on River's
 * transactional emails): a colored band with the Ganamos logo, a large title,
 * a greeting and short copy, an optional label/value details table, an
 * optional callout and image, and one call-to-action button.
 *
 * Everything is table-based with inline styles so it renders the same in
 * Gmail, Apple Mail and Outlook. Values passed in are HTML: escape any
 * user-supplied text with escapeHtml() first.
 */

export const EMAIL_BASE_URL = "https://www.ganamos.earth"

/** The app's primary green (Tailwind green-600, the Post button). */
export const EMAIL_GREEN = "#16a34a"

const THEMES = {
  green: { band: EMAIL_GREEN, button: EMAIL_GREEN, link: EMAIL_GREEN },
  /** Admin-only emails keep their yellow theme. */
  amber: { band: "#d97706", button: "#d97706", link: "#b45309" },
} as const

const CALLOUTS = {
  info: { bg: "#eff6ff", border: "#3b82f6" },
  success: { bg: "#f0fdf4", border: EMAIL_GREEN },
  warning: { bg: "#fffbeb", border: "#f59e0b" },
  neutral: { bg: "#f9fafb", border: "#9ca3af" },
} as const

export type EmailTheme = keyof typeof THEMES
export type CalloutTone = keyof typeof CALLOUTS

export interface EmailContent {
  /** Large heading under the logo, e.g. "Bitcoin Received" */
  title: string
  /** Inbox preview text (hidden in the body) */
  preheader?: string
  /** First name; renders "Hello {name}," */
  greeting?: string
  /** Paragraphs of HTML shown under the greeting */
  paragraphs?: string[]
  /** Label/value rows, River style */
  details?: Array<[label: string, value: string]>
  /** Highlighted box, e.g. a fixer's note or a warning */
  callout?: { tone?: CalloutTone; title?: string; html: string }
  /** An image (e.g. the before/after photo) */
  image?: { src: string; alt: string }
  /** Primary button */
  button?: { label: string; href: string }
  /** Paragraphs shown after the button */
  afterParagraphs?: string[]
  /** Footer note; defaults to the automated-notification line */
  footer?: string
  theme?: EmailTheme
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const p = (html: string) =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">${html}</p>`

export function renderEmail(content: EmailContent): string {
  const theme = THEMES[content.theme ?? "green"]
  const parts: string[] = []

  parts.push(
    `<h1 style="margin:0 0 24px;font-size:30px;line-height:1.2;font-weight:800;color:#111827;letter-spacing:-0.01em;">${content.title}</h1>`
  )
  if (content.greeting) parts.push(p(`Hello ${content.greeting},`))
  for (const para of content.paragraphs ?? []) parts.push(p(para))

  if (content.details?.length) {
    const rows = content.details
      .map(
        ([label, value], i) => `
          <tr>
            <td style="padding:12px 16px 12px 0;${i ? "border-top:1px solid #e5e7eb;" : ""}font-size:15px;font-weight:700;color:#111827;vertical-align:top;width:38%;">${label}</td>
            <td style="padding:12px 0;${i ? "border-top:1px solid #e5e7eb;" : ""}font-size:15px;color:#374151;vertical-align:top;word-break:break-word;">${value}</td>
          </tr>`
      )
      .join("")
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border-collapse:collapse;">${rows}</table>`
    )
  }

  if (content.callout) {
    const tone = CALLOUTS[content.callout.tone ?? "neutral"]
    parts.push(
      `<div style="margin:0 0 24px;padding:16px 18px;background:${tone.bg};border-left:4px solid ${tone.border};border-radius:8px;font-size:15px;line-height:1.6;color:#374151;">${
        content.callout.title
          ? `<div style="font-weight:700;color:#111827;margin-bottom:4px;">${content.callout.title}</div>`
          : ""
      }${content.callout.html}</div>`
    )
  }

  if (content.image) {
    parts.push(
      `<img src="${content.image.src}" alt="${escapeHtml(content.image.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;margin:0 0 24px;border:0;">`
    )
  }

  if (content.button) {
    parts.push(`
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="border-radius:10px;background:${theme.button};">
          <a href="${content.button.href}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${content.button.label}</a>
        </td></tr>
      </table>`)
  }

  for (const para of content.afterParagraphs ?? []) parts.push(p(para))

  const footer =
    content.footer ??
    `This is an automated notification from <a href="${EMAIL_BASE_URL}" style="color:${theme.link};text-decoration:none;">Ganamos</a>.`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};">
  ${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td align="center" style="background:${theme.band};padding:28px 24px;">
          <a href="${EMAIL_BASE_URL}" style="text-decoration:none;">
            <img src="${EMAIL_BASE_URL}/email/logo-white.png" alt="Ganamos!" width="180" height="40" style="display:block;width:180px;height:40px;border:0;">
          </a>
        </td></tr>
        <tr><td style="padding:36px 32px 12px;font-family:${FONT};">
          ${parts.join("\n")}
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #f3f4f6;font-family:${FONT};font-size:13px;line-height:1.6;color:#6b7280;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
