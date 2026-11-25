import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Satoshi Pet - Make Bitcoin Physical & Fun"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Social preview: text plus simple art (no product photos yet).
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 90px",
          background: "linear-gradient(180deg, #1f2937 0%, #111827 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
          <div style={{ fontSize: 34, color: "#4ade80", marginBottom: 20 }}>Satoshi Pet</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>Make Bitcoin</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, color: "#a78bfa" }}>Physical &amp; Fun</div>
          <div style={{ fontSize: 30, color: "#d1d5db", marginTop: 28, lineHeight: 1.3 }}>
            A cute hardware companion that reacts to your Bitcoin activity.
          </div>
        </div>
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 9999,
            background: "linear-gradient(135deg, #c084fc 0%, #3b82f6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z" />
            <path d="M8 14v.5" />
            <path d="M16 14v.5" />
            <path d="M11.25 16.25h1.5L12 17l-.75-.75Z" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  )
}
