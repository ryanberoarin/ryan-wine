import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function FaviconIcon() {
  const S = 32
  const u = (v: number) => (v / 100) * S

  return new ImageResponse(
    (
      <div style={{
        width: S, height: S,
        borderRadius: S,
        background: '#03C75A',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* N bars */}
        <div style={{ position: 'absolute', left: u(11), top: u(18), width: u(14), height: u(64), background: 'white', borderRadius: u(3) }} />
        <div style={{ position: 'absolute', left: u(59), top: u(18), width: u(14), height: u(64), background: 'white', borderRadius: u(3) }} />
        <div style={{
          position: 'absolute',
          left: u(42) - u(8), top: u(50) - u(40),
          width: u(16), height: u(80),
          background: 'white',
          transform: 'rotate(36.87deg)',
          transformOrigin: 'center',
        }} />
        {/* Simplified grape cluster (3 dots) */}
        <div style={{ position: 'absolute', left: u(79), top: u(22), width: u(13), height: u(13), borderRadius: u(7), background: '#8B1A50' }} />
        <div style={{ position: 'absolute', left: u(72), top: u(33), width: u(11), height: u(11), borderRadius: u(6), background: '#7A1545' }} />
        <div style={{ position: 'absolute', left: u(85), top: u(33), width: u(11), height: u(11), borderRadius: u(6), background: '#7A1545' }} />
        <div style={{ position: 'absolute', left: u(79), top: u(44), width: u(9),  height: u(9),  borderRadius: u(5), background: '#5C0C35' }} />
      </div>
    ),
    size,
  )
}
