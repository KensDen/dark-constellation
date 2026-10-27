// "▼ more below" (G-099), on a solid band of its own with the list fading
// out above it (v1.6 R2, R1's fresh eyes F16: the cue sat over the next
// card's half-faded name and chips, which read as garbled fragments). The
// band is the panel's own colour, so nothing shows through the words.

import { MORE_BELOW } from './boardModel'

export default function ScrollCue({ on = 'panel', className = '', ...data }: { on?: 'panel' | 'ground'; className?: string } & Record<`data-${string}`, boolean>) {
  return (
    <div {...data} aria-hidden="true" className={`pointer-events-none z-10 flex flex-col ${className}`}>
      <span className={`h-4 bg-linear-to-t to-transparent ${on === 'ground' ? 'from-dc-ground' : 'from-dc-panel'}`} />
      <p className={`border-t border-dc-line/60 py-0.5 text-center font-mono text-[10px] tracking-widest ${on === 'ground' ? 'bg-dc-ground text-dc-ink' : 'bg-dc-panel text-dc-muted'}`}>{MORE_BELOW}</p>
    </div>
  )
}
