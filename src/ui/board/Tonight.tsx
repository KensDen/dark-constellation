// THE TONIGHT CARD (v1.3 brief 5.3 item 3). COLDVEIL, the watch officer's
// line for the turn, then each slot: a fixed slot is CONFIRMED; a drawn one
// reads "COLDVEIL WILL HIT 1 OF N" with "They go for the one you've
// covered least." and, on turns 1 and 2, the key (⚠ EXPOSED will hit ·
// ✓ BLOCKED is safe). Each move is a card: its name, vector → layer,
// strength, a status (icon and word, never a control) and what a tap does,
// "defend ›" or "details ›". LIKELY TARGET, EITHER and CONFIRMED come from
// ./tonight, which is the engine's own pick.
//
// Without an intel brief a drawn slot's moves are Unidentified: a noise
// field, the vector and layer, and "reveal ›", which opens PROCURE at the
// intel brief (R6 question 14: it used to pulse the intel row and reveal
// nothing). With the brief ordered the names decode in.
//
// The full brief stays one tap away at the foot (QC G-026: it reads "Hide
// full brief" while open, and it is closed whenever the card is not on
// screen, so playback never squeezes it; G-099: a cue says when it scrolls).

import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { planFor } from '../../engine/campaign'
import { gnssDenied } from '../../engine/rules'
import type { GameState, ThreatEvent } from '../../engine/types'
import { useCueClass, usePageVisible, useReducedMotion } from '../cues/motion'
import PixelSprite from '../sprites/PixelSprite'
import { ICON_LOCK, ICON_WARN, tinted } from '../sprites/icons'
import {
  FULL_BRIEF_CLOSE,
  FULL_BRIEF_OPEN,
  INTEL_ROW,
  briefButton,
  briefLockedTag,
  KEY_BLOCKED,
  KEY_EITHER,
  KEY_EXPOSED,
  KEY_LIKELY,
  REVEAL,
  STATUS,
  TONIGHT_HIDDEN,
  tonightReason,
  UNIDENTIFIED,
  WILL_HIT_LEAD,
  willHitCount,
  vectorTo,
  confirmedNote,
  shortName,
  showsStrength,
  tapHint,
  type MoveRead,
  type MoveStatus,
  type SlotView,
  chainLine,
} from './boardModel'

// The full brief and ../brief.ts load as their own chunk (see ./FullBrief),
// fetched as soon as the card mounts.
const FullBrief = lazy(() => import('./FullBrief'))
const preloadFullBrief = () => import('./FullBrief').catch(() => undefined)


const TONE_TEXT: Record<string, string> = { hostile: 'text-dc-hostile', warn: 'text-dc-warn', go: 'text-dc-go', friendly: 'text-dc-friendly' }

export function StatusTag({ status }: { status: MoveStatus }) {
  const s = STATUS[status]
  return (
    // PARTLY BLOCKED may break between its words in a narrow move card
    // rather than run past its border (R6 question 14).
    <span data-status={status} className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-wider ${TONE_TEXT[s.token]}`}>
      <PixelSprite sprite={tinted(s.icon, s.token)} scale={1} name={`status-${status}`} />
      {s.word}
    </span>
  )
}


// The noise over an unnamed move: a field of grey pixels, redrawn about 8
// times a second, one still field under reduced motion or a hidden tab.
// In green, it is the decode over a move the brief has just named (v1.3
// R5, brief 8.3, as the prototype draws it).
const NOISE_RGB = { muted: '139,152,168', go: '124,255,155' } as const
// The decode's length, src/index.css's .dc-decode.
const DECODE_MS = 900
function Noise({ tone = 'muted' }: { tone?: keyof typeof NOISE_RGB }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  useEffect(() => {
    const cv = ref.current
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = cv?.getContext('2d') ?? null
    } catch {
      ctx = null
    }
    if (!cv || !ctx) return
    const c = ctx
    const paint = (seed: number) => {
      const w = (cv.width = Math.max(1, Math.round(cv.clientWidth / 3)))
      const h = (cv.height = Math.max(1, Math.round(cv.clientHeight / 3)))
      let a = seed
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1) {
          a = (a * 1103515245 + 12345) & 0x7fffffff
          c.fillStyle = `rgba(${NOISE_RGB[tone]},${((a >> 16) % 100) / (tone === 'go' ? 300 : 900)})`
          c.fillRect(x, y, 1, 1)
        }
    }
    paint(7)
    if (reduced || !visible) return
    let n = 7
    const id = window.setInterval(() => paint((n += 1)), 120)
    return () => window.clearInterval(id)
  }, [reduced, visible, tone])
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
}

// A move card's flag, and the same chip in the key.
const FLAG_TAG = 'px-1 font-mono text-[10px] tracking-wider text-dc-ground'

function MoveCard({ read, onMove, decoding = false, open }: { read: MoveRead; onMove: (ev: ThreatEvent) => void; decoding?: boolean; open: boolean }) {
  const { ev, status, flag } = read
  // The status changes the moment an order lands; a short highlight says so,
  // and only then: not when the card first appears.
  const first = useRef(status)
  const changed = useCueClass(status === first.current ? null : status, 'dc-flash-good', useReducedMotion())
  const likely = flag === 'LIKELY TARGET' || flag === 'EITHER'
  return (
    <button
      type="button"
      data-move={ev.id}
      data-flag={flag ?? undefined}
      onClick={() => onMove(ev)}
      className={`dc-tile relative flex min-w-0 flex-col gap-1 border bg-dc-chrome p-2 text-left ${likely ? 'border-dc-hostile' : 'border-dc-line'}`}
    >
      {/* The decode: green noise over the name as the brief names it,
          fading off it. Only with motion (decoding is never set without). */}
      {decoding && (
        <span data-decode aria-hidden="true" className="dc-decode pointer-events-none absolute inset-0 overflow-hidden">
          <Noise tone="go" />
        </span>
      )}
      {/* One line, and close enough to the corner that LIKELY TARGET stays
          inside a three-move card at 375 in an iPhone's mono face (R6
          question 14: nowrap alone hung it 0.88 px past the card). */}
      {flag && (
        <span data-flag-tag className={`absolute -top-2 right-1 whitespace-nowrap ${FLAG_TAG} ${flag === 'CONFIRMED' ? 'bg-dc-warn' : 'bg-dc-hostile'}`}>
          {flag}
        </span>
      )}
      <span className="text-[13px] font-semibold leading-tight text-dc-ink">{shortName(ev)}</span>
      <span className="flex flex-wrap gap-x-2 font-mono text-[10px] text-dc-muted">
        <span>{vectorTo(ev)}</span>
        {showsStrength(ev) && (
          <span>
            STRENGTH <span className="text-dc-hostile">{'●'.repeat(ev.baseSeverity)}</span>
          </span>
        )}
      </span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-1">
        <span className={changed}>
          <StatusTag status={status} />
        </span>
        <span className="font-mono text-[10px] text-dc-friendly">{tapHint(status, open)}</span>
      </span>
    </button>
  )
}

function UnknownCard({ ev, onReveal }: { ev: ThreatEvent; onReveal: () => void }) {
  return (
    <button type="button" data-move-unknown onClick={onReveal} className="dc-tile relative flex min-w-0 flex-col gap-1 overflow-hidden border border-dc-line bg-dc-chrome p-2 text-left">
      <Noise />
      <span className="relative text-[13px] font-semibold leading-tight text-dc-muted">{UNIDENTIFIED}</span>
      <span className="relative font-mono text-[10px] text-dc-muted">{vectorTo(ev)}</span>
      <span className="relative mt-auto font-mono text-[10px] text-dc-friendly">{REVEAL}</span>
    </button>
  )
}

export interface TonightProps {
  state: GameState
  slots: SlotView[]
  // The brief is free tonight, ordered, or neither.
  brief: 'free' | 'ordered' | 'none'
  briefPrice: number
  onMove: (ev: ThreatEvent) => void
  // Opens PROCURE at the intel brief, where its lock is said (v1.5 R2).
  onOrderBrief: () => void
  // The full brief opens with the card: on the desktop board, which has
  // the room (v1.5 R2's review: its middle column stood half empty).
  openBrief?: boolean
  onIntel: () => void
  onTag: (tag: string) => void
  // A nonce that, when it changes, pulses the moves.
  pulseMoves: number
  onReveal: () => void
  // Whether tonight can still take a new defense (v1.4: one a night).
  defenseOpen: boolean
}

export default function Tonight({ state, slots, brief, briefPrice, onMove, onOrderBrief, onIntel, onTag, pulseMoves, onReveal, defenseOpen, openBrief = false }: TonightProps) {
  const named = brief !== 'none'
  const intro = planFor(state, state.turn)?.intro ?? ''
  const reduced = useReducedMotion()
  const decode = useCueClass(named ? 'named' : null, 'dc-manifest-in', reduced)
  // The green noise over the names, for the decode's own length.
  const decoding = useCueClass(named ? 'named' : null, 'dc-decode', reduced, DECODE_MS) !== ''
  // Each turn's intro arrives as a transmission (the turn-start cue).
  const arriving = useCueClass(state.turn, 'dc-transmission-in', reduced)
  const flashMoves = useCueClass(pulseMoves || null, 'dc-pulse-hostile', reduced)
  const card = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (pulseMoves) card.current?.querySelector('[data-move]')?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [pulseMoves, reduced])
  const [open, setOpen] = useState(openBrief)
  useEffect(() => {
    void preloadFullBrief()
  }, [])
  const chain = gnssDenied(state.conditions, state.scenario)
  const firstDraw = slots.findIndex((s) => !s.fixed)
  return (
    <section ref={card} aria-label="Tonight" data-tonight className="flex-none border border-dc-line bg-dc-panel px-3 py-1">
      <div className="flex items-center justify-between gap-2">
        <p className="whitespace-nowrap font-mono text-[10px] tracking-widest text-dc-muted">
          TONIGHT{brief === 'free' && <span className="text-dc-go"> · INTEL BRIEF FREE</span>}
        </p>
        <button type="button" data-full-brief aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-my-3 min-h-11 whitespace-nowrap font-mono text-[10px] text-dc-friendly">
          {open ? FULL_BRIEF_CLOSE : FULL_BRIEF_OPEN}
        </button>
      </div>
      <p data-intro className={`${arriving} mt-1 border-l-2 border-dc-hostile pl-2 text-xs leading-snug text-dc-ink`}>
        {intro}
      </p>
      {chain && (
        <p data-chain className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-dc-hostile">
          <PixelSprite sprite={tinted(ICON_WARN, 'hostile')} scale={1} name="status-exposed" />
          {chainLine()}
        </p>
      )}
      {slots.map((slot, i) => (
        // The rule (or the hidden line) once a night, on its first drawn
        // slot: it is the same sentence for every slot (v1.3 R6).
        <div key={i} data-slot={slot.fixed ? 'fixed' : 'draw'} className="mt-1.5">
          {slot.fixed ? (
            <p className="font-mono text-[10px] tracking-widest text-dc-warn">
              CONFIRMED <span className="text-dc-muted">· {confirmedNote(slot.moves[0].ev, slot.moves[0].status)}</span>
            </p>
          ) : (
            <>
              <p className="font-mono text-[11px] tracking-widest text-dc-ink">
                {WILL_HIT_LEAD}
                <b className="text-dc-hostile">{willHitCount(slot.moves.length)}</b>
              </p>
              {i === firstDraw && (
                <p className="text-xs text-dc-muted">
                  {slot.hidden ? TONIGHT_HIDDEN : tonightReason(state.turn, defenseOpen)}
                  {/* The flags' key (R6 question 11), set after the rule that
                      names a pick and a tie, on the room its second line leaves:
                      on a key line of their own they pushed the turn-1 board
                      past 375x667. */}
                  {!slot.hidden && state.turn <= 2 && (
                    <span data-flag-key className="text-[10px]">
                      {' '}
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className={`${FLAG_TAG} bg-dc-hostile`}>LIKELY TARGET</span> {KEY_LIKELY}
                      </span>{' '}
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className={`${FLAG_TAG} bg-dc-hostile`}>EITHER</span> {KEY_EITHER}
                      </span>
                    </span>
                  )}
                </p>
              )}
              {!slot.hidden && state.turn <= 2 && (
                <p data-key className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] text-dc-muted">
                  <span className="inline-flex items-center gap-1">
                    <StatusTag status="exposed" /> {KEY_EXPOSED}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <StatusTag status="blocked" /> {KEY_BLOCKED}
                  </span>
                </p>
              )}
            </>
          )}
          <div className={`mt-1.5 grid gap-2 ${slot.moves.length === 1 ? 'grid-cols-1' : slot.moves.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} ${slot.hidden ? '' : `${decode} ${flashMoves}`}`}>
            {slot.moves.map((read) =>
              slot.hidden ? <UnknownCard key={read.ev.id} ev={read.ev} onReveal={onReveal} /> : <MoveCard key={read.ev.id} read={read} onMove={onMove} decoding={decoding} open={defenseOpen} />,
            )}
          </div>
        </div>
      ))}
      {brief !== 'free' && (
        <div data-intel-row className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-dc-muted">{INTEL_ROW[brief === 'ordered' ? 'ordered' : 'none']}</p>
          {/* Once ordered the brief has named the moves and is locked
              (v1.5 R2): a status with its icon, not a control. Before, the
              row opens PROCURE at the brief, which says so first. */}
          {brief === 'ordered' ? (
            <span data-brief-locked className="flex flex-none items-center gap-1 font-mono text-[10px] tracking-wider text-dc-go">
              <PixelSprite sprite={tinted(ICON_LOCK, 'go')} scale={1} name="brief-lock" />
              {briefLockedTag(briefPrice)}
            </span>
          ) : (
            <button
              type="button"
              data-brief-order
              onClick={onOrderBrief}
              className="dc-tile min-h-11 flex-none border border-dc-line px-2 font-mono text-[10px] tracking-wider text-dc-ink"
            >
              {briefButton(briefPrice)}
            </button>
          )}
        </div>
      )}
      <div>
        {open && (
          <Suspense fallback={<p className="font-mono text-[10px] text-dc-muted">Loading</p>}>
            <FullBrief state={state} named={named} onIntel={onIntel} onTag={onTag} />
          </Suspense>
        )}
      </div>
    </section>
  )
}
