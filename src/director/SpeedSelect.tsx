// Playback speed control (Round 2). Rendered in two places: inside the
// playback view for changes mid-turn, and in the hardening phase so the
// control is reachable even at instant speed, which never mounts the
// playback view at all. Without the second copy, choosing instant once
// (or having reduced motion select it) would leave no way back to 1x.

import { SPEEDS, SPEED_LABEL, type Speed } from './director'

export default function SpeedSelect({
  speed,
  onChange,
  label = 'Playback:',
}: {
  speed: Speed
  onChange: (speed: Speed) => void
  label?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs text-ink-dim">{label}</span>
      {SPEEDS.map((s) => (
        <button
          key={s}
          aria-pressed={speed === s}
          onClick={() => onChange(s)}
          className={`font-mono text-xs border px-3 min-h-11 min-w-11 ${
            speed === s
              ? 'border-phosphor bg-phosphor/15 text-phosphor'
              : 'border-phosphor/40 text-ink-dim hover:bg-phosphor/10'
          }`}
        >
          {SPEED_LABEL[s]}
        </button>
      ))}
    </div>
  )
}
