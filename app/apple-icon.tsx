import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  const S = 180
  const u = (v: number) => (v / 100) * S

  const grapes = [
    { cx: 81.5, cy: 26,  fill: '#8B1A50' },
    { cx: 75,   cy: 37,  fill: '#8B1A50' },
    { cx: 88,   cy: 37,  fill: '#8B1A50' },
    { cx: 68.5, cy: 48,  fill: '#7A1545' },
    { cx: 81.5, cy: 48,  fill: '#7A1545' },
    { cx: 94.5, cy: 48,  fill: '#7A1545' },
    { cx: 75,   cy: 59,  fill: '#6B1040' },
    { cx: 88,   cy: 59,  fill: '#6B1040' },
    { cx: 81.5, cy: 70,  fill: '#5C0C35' },
  ]

  const highlights = [
    { cx: 79, cy: 23.5 }, { cx: 72.5, cy: 34.5 }, { cx: 85.5, cy: 34.5 },
    { cx: 66, cy: 45.5 }, { cx: 79,   cy: 45.5 }, { cx: 92,   cy: 45.5 },
    { cx: 72.5, cy: 56.5 }, { cx: 85.5, cy: 56.5 }, { cx: 79, cy: 67.5 },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: S, height: S,
          borderRadius: S,
          background: '#03C75A',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* N – left bar */}
        <div style={{ position: 'absolute', left: u(11), top: u(18), width: u(14), height: u(64), background: 'white', borderRadius: u(3) }} />
        {/* N – right bar */}
        <div style={{ position: 'absolute', left: u(59), top: u(18), width: u(14), height: u(64), background: 'white', borderRadius: u(3) }} />
        {/* N – diagonal (rotated rect, center at SVG 42,50, length 80, angle 36.87°) */}
        <div style={{
          position: 'absolute',
          left: u(42) - u(8), top: u(50) - u(40),
          width: u(16), height: u(80),
          background: 'white',
          transform: 'rotate(36.87deg)',
          transformOrigin: 'center',
        }} />
        {/* Grape stem */}
        <div style={{ position: 'absolute', left: u(80), top: u(8), width: u(3), height: u(16), background: '#4A2800', borderRadius: u(2) }} />
        {/* Grapes */}
        {grapes.map((g, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: u(g.cx) - u(6.5), top: u(g.cy) - u(6.5),
            width: u(13), height: u(13),
            borderRadius: u(6.5),
            background: g.fill,
          }} />
        ))}
        {/* Highlights */}
        {highlights.map((h, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: u(h.cx) - u(2), top: u(h.cy) - u(2),
            width: u(4), height: u(4),
            borderRadius: u(2),
            background: 'rgba(255,255,255,0.28)',
          }} />
        ))}
      </div>
    ),
    size,
  )
}
