// THE SIGNATURES, SMALL (v2.0 R1): each threat's look as a 40 by 40 mark,
// in the colours and forms the world draws it in (signatures.ts), for the
// contact chips over the fleet and the Dossier's cards. An unidentified
// contact shows its mark and no name, so a player who has learned the mark
// can name it without a scan pulse: recognition is the lesson.
//
// Plain SVG, moved by the stylesheet (game3d.css, the t3g- classes), still
// under Reduce Motion.

import type { ReactNode } from 'react'
import { SIGNATURE, type Form } from './signatures'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// The asset a mark is about: a small diamond, low in the frame.
const Asset = ({ x = 20, y = 27 }: { x?: number; y?: number }) => <path d={`M${x} ${y - 4}l4 4-4 4-4-4z`} fill="#c9d4e0" />

function shapes(form: Form, wide: boolean): ReactNode {
  switch (form) {
    case 'cone':
      return (
        <>
          <path d={wide ? 'M6 4L36 30H6z' : 'M6 4L27 31H13z'} fill="currentColor" opacity="0.16" />
          <g className="t3g-static" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            {(wide ? [10, 16, 22, 28] : [14, 18, 22]).map((x, i) => (
              <path key={x} d={`M${6 + i} ${6 + i * 2}L${x} 30`} strokeDasharray="2 3" />
            ))}
          </g>
          <Asset x={wide ? 20 : 20} y={29} />
        </>
      )
    case 'twin':
      return (
        <>
          <Asset x={15} y={24} />
          <g className="t3g-drift">
            <path d="M25 13l5 5-5 5-5-5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2.5 2" />
          </g>
          <path d="M5 5L22 16" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 3" opacity="0.7" />
        </>
      )
    case 'ticks':
      return (
        <>
          <circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.5 5.3" />
          <path className="t3g-tick" d="M20 20V9" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="20" r="2.4" fill="currentColor" />
        </>
      )
    case 'beam':
      return (
        <>
          <path d="M4 4L20 22" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          <g className="t3g-pulse" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
            <path d="M20 12v20M10 22h20M13 15l14 14M27 15L13 29" />
          </g>
          <circle cx="20" cy="22" r="3.2" fill="#fff" />
        </>
      )
    case 'phantom':
      return (
        <>
          <Asset y={29} />
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2">
            <rect className="t3g-blink" x="5" y="8" width="9" height="9" />
            <rect className="t3g-blink t3g-d2" x="25" y="6" width="10" height="10" />
            <rect className="t3g-blink t3g-d3" x="16" y="13" width="7" height="7" />
          </g>
        </>
      )
    case 'mask':
      return (
        <>
          <rect x="15" y="9" width="10" height="10" fill="#c9d4e0" opacity="0.55" />
          <circle className="t3g-breathe" cx="20" cy="14" r="10" fill="#05060d" stroke="currentColor" strokeWidth="1.6" />
          <Asset y={32} />
        </>
      )
    case 'drip':
      return (
        <>
          <path d="M20 36V12" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
          <g className="t3g-rise" fill="currentColor">
            <circle cx="20" cy="33" r="2.2" />
            <circle cx="20" cy="25" r="1.8" />
            <circle cx="20" cy="18" r="1.5" />
          </g>
          <Asset y={8} />
        </>
      )
    case 'seed':
      return (
        <>
          <path d="M20 8l12 12-12 12L8 20z" fill="none" stroke="#c9d4e0" strokeWidth="1.6" />
          <circle className="t3g-beat" cx="20" cy="20" r="4" fill="currentColor" />
        </>
      )
    case 'rogue':
      return (
        <>
          <Asset y={8} />
          <path d="M9 34q0-7 7-7" fill="none" stroke="#7cff9b" strokeWidth="2" />
          <path d="M11 30L19 12" stroke="#7cff9b" strokeWidth="1.2" opacity="0.7" />
          <path d="M31 34q0-7-7-7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path className="t3g-flow" d="M29 30L21 12" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2.5 2.5" />
        </>
      )
    case 'echo':
      return (
        <>
          <Asset y={8} />
          <g fill="none" stroke="currentColor" strokeWidth="1.7">
            <path className="t3g-blink" d="M13 17q7 5 14 0" />
            <path className="t3g-blink t3g-d2" d="M13 24q7 5 14 0" />
            <path className="t3g-blink t3g-d3" d="M13 31q7 5 14 0" />
          </g>
        </>
      )
    case 'listen':
      return (
        <>
          <Asset y={7} />
          <path d="M20 10L6 36h28z" fill="currentColor" opacity="0.13" />
          <path d="M26 34a5 5 0 0 1 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle className="t3g-pulse" cx="31" cy="34" r="2.2" fill="currentColor" />
        </>
      )
    case 'siphon':
      return (
        <>
          <path d="M4 30H36" stroke="#7cff9b" strokeWidth="1.8" />
          <g className="t3g-leak" fill="currentColor">
            <circle cx="24" cy="26" r="2" />
            <circle cx="18" cy="19" r="1.8" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="7" cy="6" r="1.2" />
          </g>
        </>
      )
    case 'cage':
      return (
        <>
          <Asset y={22} />
          <rect className="t3g-clamp" x="8" y="8" width="24" height="26" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M14 8v26M20 8v26M26 8v26" stroke="currentColor" strokeWidth="1.4" opacity="0.8" />
        </>
      )
    case 'hook':
      return (
        <>
          <path d="M8 3q16 2 16 18v5a5 5 0 0 1-10 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle className="t3g-pulse" cx="14" cy="26" r="2.6" fill="#fff1b8" />
          <Asset x={28} y={33} />
        </>
      )
    case 'inside':
      return (
        <>
          <rect x="11" y="20" width="18" height="15" rx="2" fill="none" stroke="#c9d4e0" strokeWidth="1.6" />
          <g className="t3g-leave" fill="currentColor">
            <circle cx="20" cy="27" r="2.2" />
            <circle cx="24" cy="17" r="1.8" />
            <circle cx="29" cy="8" r="1.4" />
          </g>
        </>
      )
    case 'debris':
      return (
        <g className="t3g-tumble" fill="currentColor">
          <path d="M6 30l5-2 1 5z" />
          <path d="M14 21l6-1-2 6z" />
          <path d="M23 14l4-3 2 5z" />
          <path d="M30 6l4 1-3 4z" />
          <path d="M20 31l3-1v3z" opacity="0.7" />
        </g>
      )
    case 'chain':
      return (
        <>
          <path d="M5 3L37 26H5z" fill="currentColor" opacity="0.2" />
          <path className="t3g-static" d="M8 7L14 26M10 6L24 26" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />
          <rect className="t3g-blink" x="25" y="27" width="9" height="9" fill="none" stroke="#ff8ad8" strokeWidth="1.6" strokeDasharray="2 2" />
          <Asset x={14} y={32} />
        </>
      )
  }
}

// `named` is false for a contact the scan has not identified: the mark is
// the same, the label says only that it is a signature and what it looks
// like.
export function SignatureGlyph({ id, size = 40, named = true, className = '' }: { id: string; size?: number; named?: boolean; className?: string }) {
  const sig = SIGNATURE[id]
  if (!sig) return null
  return (
    <svg className={`t3g ${className}`} viewBox="0 0 40 40" width={size} height={size} style={{ color: hex(sig.color) }} role="img" aria-label={named ? `Signature: ${sig.look}` : `Unidentified signature: ${sig.look}`}>
      {shapes(sig.form, !!sig.wide)}
    </svg>
  )
}

// WHY A DEFENSE HELD, as a mark beside its line: the family of the
// mechanism (the signal filtered, the sender checked, the sensors voting,
// the segment walled off, the link encrypted, the image attested).
export type Mechanism = 'filter' | 'auth' | 'vote' | 'wall' | 'crypt' | 'attest' | 'track'
export const MECHANISM: Record<string, Mechanism> = {
  antiJam: 'filter',
  linkAuth: 'auth',
  pntAuth: 'auth',
  sensorFusion: 'vote',
  tierAAttestation: 'attest',
  mlPipelineIntegrity: 'attest',
  groundZeroTrust: 'wall',
  insiderProgram: 'wall',
  ssaManeuver: 'track',
  encryptedBackhaul: 'crypt',
  irRetainer: 'wall',
}
const MECH_LOOK: Record<Mechanism, string> = {
  filter: 'the noise filtered out, the signal through',
  auth: 'a signal checked and refused',
  vote: 'three sensors voting, two against one',
  wall: 'a wall between segments',
  crypt: 'a link locked',
  attest: 'an image checked against its seal',
  track: 'an orbit tracked',
}

export function MechanismGlyph({ defense, size = 44 }: { defense: string; size?: number }) {
  const m = MECHANISM[defense]
  if (!m) return null
  const go = '#7cff9b'
  const bad = '#ff5a4f'
  return (
    <svg className="t3g t3g-mech" viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={`Why it held: ${MECH_LOOK[m]}`}>
      {m === 'filter' && (
        <>
          <path d="M3 12h10M3 20h10M3 28h10" stroke={bad} strokeWidth="2" strokeDasharray="2 2.5" />
          <path d="M16 6v28" stroke="#6fe3ff" strokeWidth="2.6" />
          <path className="t3g-flow" d="M19 20h18" stroke={go} strokeWidth="2.4" strokeDasharray="4 3" />
        </>
      )}
      {m === 'auth' && (
        <>
          <path className="t3g-flow" d="M3 14h14" stroke={bad} strokeWidth="2" strokeDasharray="3 3" />
          <path d="M19 9l6 10M25 9l-6 10" stroke={bad} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M3 28h14" stroke={go} strokeWidth="2" />
          <path className="t3g-pop" d="M19 28l4 4 8-9" fill="none" stroke={go} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {m === 'vote' && (
        <>
          <circle cx="9" cy="14" r="5" fill={bad} />
          <circle className="t3g-pop" cx="22" cy="14" r="5" fill={go} />
          <circle className="t3g-pop t3g-d2" cx="33" cy="14" r="5" fill={go} />
          <path d="M6 30h28" stroke="#6fe3ff" strokeWidth="2" />
          <path className="t3g-pop t3g-d3" d="M16 27l4 4 7-8" fill="none" stroke={go} strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
      {m === 'wall' && (
        <>
          <rect x="4" y="9" width="13" height="22" rx="2" fill="none" stroke={bad} strokeWidth="2" />
          <path d="M20 5v30" stroke="#6fe3ff" strokeWidth="3" />
          <rect x="23" y="9" width="13" height="22" rx="2" fill="none" stroke={go} strokeWidth="2" />
          <circle className="t3g-pulse" cx="10.5" cy="20" r="3" fill={bad} />
        </>
      )}
      {m === 'crypt' && (
        <>
          <path className="t3g-flow" d="M3 28h34" stroke={go} strokeWidth="2.2" strokeDasharray="1.5 3" />
          <rect x="13" y="12" width="14" height="11" rx="2" fill="#6fe3ff" />
          <path d="M16 12V9a4 4 0 0 1 8 0v3" fill="none" stroke="#6fe3ff" strokeWidth="2.2" />
        </>
      )}
      {m === 'attest' && (
        <>
          <rect x="6" y="8" width="16" height="24" rx="2" fill="none" stroke="#c9d4e0" strokeWidth="1.8" />
          <path d="M10 14h8M10 19h8M10 24h5" stroke="#c9d4e0" strokeWidth="1.6" />
          <circle cx="29" cy="24" r="7" fill="none" stroke={go} strokeWidth="2" />
          <path className="t3g-pop" d="M25.5 24l2.6 2.8 4.6-5.4" fill="none" stroke={go} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
      {m === 'track' && (
        <>
          <ellipse cx="20" cy="20" rx="16" ry="8" fill="none" stroke="#6fe3ff" strokeWidth="1.6" strokeDasharray="3 3" />
          <path d="M6 30L34 10" stroke="#c9d4e0" strokeWidth="1.4" strokeDasharray="1.5 3" />
          <circle className="t3g-pulse" cx="27" cy="13.5" r="3" fill={go} />
        </>
      )}
    </svg>
  )
}

// The gesture a response is made with, as a small mark on its piece.
export function GestureMark({ gesture }: { gesture: 'reroute' | 'isolate' | 'shield' | null }) {
  if (!gesture) return null
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="t3-gmark">
      {gesture === 'reroute' && <path d="M3 18q9 0 9-7t9-7M17 2l4 2-2 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      {gesture === 'isolate' && (
        <>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 3" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </>
      )}
      {gesture === 'shield' && <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />}
    </svg>
  )
}
