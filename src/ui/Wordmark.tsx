// Wordmark rendered as live DOM text in the bundled pixel display font
// (R3.5), replacing the R2 SVG-in-img wordmark. Because the font is bundled
// and self-hosted, the type renders identically on every platform, which
// kills the platform-fallback kerning drift the SVG version suffered. The
// hero's diagonal breach line survives as the one decorative gesture.
//
// The brand face stays on the title in the 3D game's look (v2.0 R3, Ken's
// ruling of 15 November 2026: the title in 3D), where it is the one thing
// still set in it; a soft glow sits it in the lit world behind it, in
// place of the hard edge the pixel title gave it.

import { GAME_TITLE } from '../config'

const GLOW = '0 0 0.9em rgba(53, 240, 149, 0.5)'

export default function Wordmark({
  className = '',
  size = '1.5rem',
}: {
  className?: string
  size?: string
}) {
  return (
    <span
      className={`relative inline-block font-display text-phosphor leading-none whitespace-nowrap ${className}`}
      style={{ fontSize: size, letterSpacing: '-0.04em', textShadow: GLOW }}
      aria-label={GAME_TITLE}
      role="img"
    >
      <span aria-hidden="true">{GAME_TITLE}</span>
      {/* Breach line: a thin diagonal slash echoing the split-sphere hero. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bg-phosphor"
        style={{
          top: '-18%',
          left: '49.5%',
          width: '2px',
          height: '136%',
          transform: 'rotate(20deg)',
          transformOrigin: 'center',
          boxShadow: GLOW,
        }}
      />
    </span>
  )
}
