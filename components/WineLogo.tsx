export default function WineLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="wl-circ">
          <circle cx="50" cy="50" r="50"/>
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill="#03C75A"/>
      <g clipPath="url(#wl-circ)">
        {/* N – left bar */}
        <rect x="11" y="18" width="14" height="64" rx="3" fill="white"/>
        {/* N – right bar */}
        <rect x="59" y="18" width="14" height="64" rx="3" fill="white"/>
        {/* N – diagonal */}
        <polygon points="11,18 25,18 73,82 59,82" fill="white"/>
        {/* Grape stem */}
        <rect x="80" y="8" width="3" height="16" rx="1.5" fill="#4A2800"/>
        {/* Leaves */}
        <path d="M81.5,12 C85,5 94,5 93,14 C88,12 83,14 81.5,12Z" fill="#02893F"/>
        <path d="M81.5,12 C78,5 69,5 70,14 C75,12 80,14 81.5,12Z" fill="#027A40"/>
        {/* Grape cluster */}
        <circle cx="81.5" cy="26"  r="6.5" fill="#8B1A50"/>
        <circle cx="75"   cy="37"  r="6.5" fill="#8B1A50"/>
        <circle cx="88"   cy="37"  r="6.5" fill="#8B1A50"/>
        <circle cx="68.5" cy="48"  r="6.5" fill="#7A1545"/>
        <circle cx="81.5" cy="48"  r="6.5" fill="#7A1545"/>
        <circle cx="94.5" cy="48"  r="6.5" fill="#7A1545"/>
        <circle cx="75"   cy="59"  r="6.5" fill="#6B1040"/>
        <circle cx="88"   cy="59"  r="6.5" fill="#6B1040"/>
        <circle cx="81.5" cy="70"  r="6.5" fill="#5C0C35"/>
        {/* Highlights */}
        <circle cx="79"   cy="23.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="72.5" cy="34.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="85.5" cy="34.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="66"   cy="45.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="79"   cy="45.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="92"   cy="45.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="72.5" cy="56.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="85.5" cy="56.5" r="2" fill="rgba(255,255,255,0.28)"/>
        <circle cx="79"   cy="67.5" r="2" fill="rgba(255,255,255,0.28)"/>
      </g>
    </svg>
  )
}
