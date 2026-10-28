// THE NIGHT'S ROWS (v1.6 R2): a row a move, as the desktop's night log
// (./NightLog.tsx) and the phone's strike card (src/ui/night/cards.tsx)
// both write them.

import type { Scenario } from '../../engine/types'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_BURN, ICON_CHECK, ICON_CROSS, ICON_HALF, tinted } from '../sprites/icons'
import type { Sprite, Token } from '../sprites/sprite'
import { shortName } from './boardModel'
import type { Trace } from './strike'

const RESULT: Record<Trace['result'], { word: string; icon: Sprite; token: Token }> = {
  blocked: { word: 'BLOCKED', icon: ICON_CHECK, token: 'go' },
  partial: { word: 'PARTIAL', icon: ICON_HALF, token: 'warn' },
  hit: { word: 'HIT', icon: ICON_CROSS, token: 'hostile' },
  clear: { word: 'CLEAR', icon: ICON_BURN, token: 'friendly' },
  lost: { word: 'LOST', icon: ICON_CROSS, token: 'hostile' },
}
const TEXT: Record<Token, string> = { go: 'text-dc-go', warn: 'text-dc-warn', hostile: 'text-dc-hostile', friendly: 'text-dc-friendly' } as Record<Token, string>

const logName = (scenario: Scenario, id: string) => {
  const def = scenario.events.find((e) => e.id === id)
  return def ? shortName(def) : id
}

// A row a move: its result as an icon and a word (section 4 rule 8), the
// move and its target, and the score's change.
// END OF TURN leaves the change off (`delta` false, v1.6 R4): its SCORE panel
// carries the night's total beside it.
export function LogRows({ scenario, log, signs, size = 'text-sm', delta = true }: { scenario: Scenario; log: readonly Trace[]; signs: ReadonlyMap<string, string>; size?: string; delta?: boolean }) {
  return (
    <>
      {log.map((t) => {
        const r = RESULT[t.result]
        return (
          <li key={t.id} data-log={t.result} className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 border-b border-dc-line/60 pb-1.5 ${size}`}>
            <span className={`flex items-center gap-1 font-mono text-[11px] tracking-wider ${TEXT[r.token]}`}>
              <PixelSprite sprite={tinted(r.icon, r.token)} scale={1} name={`log-${t.result}`} />
              {r.word}
            </span>
            <span className="min-w-0">
              {logName(scenario, t.eventId)}
              {t.assetId && signs.get(t.assetId) && <span className="text-dc-muted"> · {signs.get(t.assetId)}</span>}
            </span>
            {delta && <span className={`font-mono text-xs ${t.delta < 0 ? 'text-dc-hostile' : 'text-dc-muted'}`}>{t.delta < 0 ? t.delta.toFixed(1) : 'NO LOSS'}</span>}
          </li>
        )
      })}
    </>
  )
}

