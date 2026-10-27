// THE TONIGHT CARD (v1.3 brief 5.3 item 3). COLDVEIL, the watch officer's
// line for the turn, then each slot: a fixed slot is CONFIRMED; a drawn one
// reads "WILL HIT 1 OF N" (COLDVEIL WILL HIT until v1.6 R3). Each move is a card: its name, vector
// → layer, strength and a status (icon and word). LIKELY TARGET, EITHER
// and CONFIRMED come from ./tonight, which is the engine's own pick.
//
// DECLUTTERED IN v1.6 R3 (Ken's playtest item 1, "SUPER busy", every turn):
// the rule and both keys stand behind a "?" on the header, open on their
// own the first time a player sees the board and closed after; each move
// card is one whole-card tap with one tag, its status, and the likely
// target marked by a reticle and a red edge rather than a second tag; no
// "defend ›", "details ›" or "reveal ›". Item 6: the full brief opens as a
// sheet from its icon on the header, and COLDVEIL's card from its name and
// emblem there, so nothing in the card scrolls inside the board.
//
// Without an intel brief a drawn slot's moves are Unidentified: a noise
// field and the vector and layer; a tap opens PROCURE at the intel brief
// (R6 question 14). With the brief ordered the names decode in.

import { useEffect, useRef, useState } from 'react'
import { planFor } from '../../engine/campaign'
import { gnssDenied } from '../../engine/rules'
import type { GameState, ThreatEvent } from '../../engine/types'
import { useCueClass, usePageVisible, useReducedMotion } from '../cues/motion'
import PixelSprite from '../sprites/PixelSprite'
import { COLDVEIL_EMBLEM, ICON_AIM, ICON_BRIEF, ICON_HELP, ICON_LOCK, ICON_WARN, tinted } from '../sprites/icons'
import type { Sprite } from '../sprites/sprite'
import {
  BRIEF_LABEL,
  COLDVEIL_LABEL,
  HELP_LABEL,
  HELP_SEEN_KEY,
  INTEL_ROW,
  briefButton,
  briefLockedRow,
  KEY_BLOCKED,
  KEY_EXPOSED,
  KEY_LIKELY,
  KEY_STRENGTH,
  STATUS,
  tonightReason,
  UNIDENTIFIED,
  WILL_HIT_LEAD,
  willHitCount,
  vectorTo,
  confirmedNote,
  shortName,
  showsStrength,
  type MoveRead,
  type MoveStatus,
  type SlotView,
  chainLine,
} from './boardModel'

// The full brief's chunk (./FullBrief, with ../brief.ts), fetched as soon
// as the card mounts, so the first tap on its icon finds it.
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

// A key on TONIGHT's header: a small bordered icon, its hit area 44px,
// reaching into the lines above and below it, which hold no control.
function HeaderKey({ icon, label, on = false, onClick, ...data }: { icon: Sprite; label: string; on?: boolean; onClick: () => void; [k: `data-${string}`]: string | boolean | undefined; 'aria-expanded'?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} {...data} className="-my-3 flex min-h-11 min-w-11 items-center justify-center">
      <span className={`flex h-6 w-6 items-center justify-center border-2 ${on ? 'border-dc-friendly bg-dc-friendly/15' : 'border-dc-line bg-dc-panel'}`}>
        <PixelSprite sprite={tinted(icon, on ? 'friendly' : 'ink')} scale={1} name={label} />
      </span>
    </button>
  )
}

// Whether this device has seen TONIGHT's "?" opened on its own.
function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

function MoveCard({ read, onMove, decoding = false }: { read: MoveRead; onMove: (ev: ThreatEvent) => void; decoding?: boolean }) {
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
      aria-label={`${shortName(ev)}, ${STATUS[status].word}${likely ? `, ${KEY_LIKELY.split(',')[0]}` : ''}`}
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
      {/* COLDVEIL's pick: a reticle in the corner and the red edge, on
          both cards of a tie; the key behind "?" says so. One tag on the
          card, its status (Ken's playtest item 1). */}
      {likely && (
        <span data-flag-tag aria-hidden="true" className="absolute right-1.5 top-1.5">
          <PixelSprite sprite={tinted(ICON_AIM, 'hostile')} scale={1} name="likely-target" />
        </span>
      )}
      <span className={`text-[13px] font-semibold leading-tight text-dc-ink ${likely ? 'pr-3' : ''}`}>{shortName(ev)}</span>
      <span className="flex flex-wrap gap-x-2 font-mono text-[10px] text-dc-muted">
        <span>{vectorTo(ev)}</span>
        {showsStrength(ev) && <span className="text-dc-hostile">{'●'.repeat(ev.baseSeverity)}</span>}
      </span>
      <span className={`mt-auto ${changed}`}>
        <StatusTag status={status} />
      </span>
    </button>
  )
}

function UnknownCard({ ev, onReveal }: { ev: ThreatEvent; onReveal: () => void }) {
  return (
    <button type="button" data-move-unknown aria-label={`${UNIDENTIFIED}, ${vectorTo(ev)}. ${INTEL_ROW.none}`} onClick={onReveal} className="dc-tile relative flex min-w-0 flex-col gap-1 overflow-hidden border border-dc-line bg-dc-chrome p-2 text-left">
      <Noise />
      <span className="relative text-[13px] font-semibold leading-tight text-dc-muted">{UNIDENTIFIED}</span>
      <span className="relative font-mono text-[10px] text-dc-muted">{vectorTo(ev)}</span>
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
  // The full brief's sheet (v1.6 R3).
  onBrief: () => void
  briefOpen?: boolean
  onIntel: () => void
  // A nonce that, when it changes, pulses the moves.
  pulseMoves: number
  onReveal: () => void
  // Whether tonight can still take a new defense (v1.4: one a night).
  defenseOpen: boolean
}

export default function Tonight({ state, slots, brief, briefPrice, onMove, onOrderBrief, onBrief, briefOpen = false, onIntel, pulseMoves, onReveal, defenseOpen }: TonightProps) {
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
  // "?" opens on its own the first board a device sees, and from then on
  // only on a tap (Ken's playtest item 1).
  const [help, setHelp] = useState(() => !helpSeen())
  useEffect(() => {
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1')
    } catch {
      // Storage refused: the "?" opens on its own each time, still closable.
    }
    void preloadFullBrief()
  }, [])
  const chain = gnssDenied(state.conditions, state.scenario)
  return (
    <section ref={card} aria-label="Tonight" data-tonight className="flex-none border border-dc-line bg-dc-panel px-3 py-1">
      <div className="flex items-center gap-2">
        {/* COLDVEIL's card, behind its name and emblem (Ken's playtest
            item 6; it was "COLDVEIL intel ›" inside the full brief). */}
        <button type="button" data-coldveil aria-label={COLDVEIL_LABEL} aria-haspopup="dialog" onClick={onIntel} className="-my-3 -ml-1 flex min-h-11 items-center">
          <span className="dc-tile flex items-center gap-1.5 border-2 border-dc-hostile/60 bg-dc-ground px-1.5 py-0.5">
            <PixelSprite sprite={COLDVEIL_EMBLEM} scale={1} name="coldveil" />
            <span className="font-display text-[10px] text-dc-hostile">COLDVEIL</span>
          </span>
        </button>
        {/* A free brief on a line of its own under TONIGHT: beside it, it
            ran out of the header at 375 between COLDVEIL and the keys. */}
        <p className="min-w-0 font-mono text-[10px] leading-tight tracking-widest text-dc-muted">
          TONIGHT
          {brief === 'free' && <span className="block whitespace-nowrap tracking-wider text-dc-go">INTEL BRIEF FREE</span>}
        </p>
        <span className="ml-auto flex flex-none items-center">
          <HeaderKey icon={ICON_HELP} label={HELP_LABEL} on={help} aria-expanded={help} data-tonight-help={help ? 'open' : 'closed'} onClick={() => setHelp((h) => !h)} />
          <HeaderKey icon={ICON_BRIEF} label={BRIEF_LABEL} on={briefOpen} data-full-brief aria-expanded={briefOpen} onClick={onBrief} />
        </span>
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
      {/* The rule and the keys, said once behind "?" (Ken's playtest item 1:
          they stood on every board, and EITHER and EXPOSED three times). */}
      {help && (
        <div data-tonight-help-panel className="mt-1.5 border-l-2 border-dc-friendly/60 pl-2 text-[11px] leading-snug text-dc-muted">
          <p>{tonightReason(state.turn, defenseOpen)}</p>
          <p data-key className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px]">
            <span className="inline-flex items-center gap-1">
              <PixelSprite sprite={tinted(ICON_AIM, 'hostile')} scale={1} name="key-likely" /> {KEY_LIKELY}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="font-mono text-dc-hostile">●</span> {KEY_STRENGTH}
            </span>
            <span className="inline-flex items-center gap-1">
              <StatusTag status="exposed" /> {KEY_EXPOSED}
            </span>
            <span className="inline-flex items-center gap-1">
              <StatusTag status="blocked" /> {KEY_BLOCKED}
            </span>
          </p>
        </div>
      )}
      {slots.map((slot, i) => (
        <div key={i} data-slot={slot.fixed ? 'fixed' : 'draw'} className="mt-1.5">
          {slot.fixed ? (
            <p className="font-mono text-[10px] tracking-widest text-dc-warn">
              CONFIRMED <span className="text-dc-muted">· {confirmedNote(slot.moves[0].ev, slot.moves[0].status)}</span>
            </p>
          ) : (
            <p className="font-mono text-[11px] tracking-widest text-dc-ink">
              {WILL_HIT_LEAD}
              <b className="text-dc-hostile">{willHitCount(slot.moves.length)}</b>
            </p>
          )}
          <div className={`mt-1.5 grid gap-2 ${slot.moves.length === 1 ? 'grid-cols-1' : slot.moves.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} ${slot.hidden ? '' : `${decode} ${flashMoves}`}`}>
            {slot.moves.map((read) =>
              slot.hidden ? <UnknownCard key={read.ev.id} ev={read.ev} onReveal={onReveal} /> : <MoveCard key={read.ev.id} read={read} onMove={onMove} decoding={decoding} />,
            )}
          </div>
        </div>
      ))}
      {brief !== 'free' && (
        <div data-intel-row className="mt-2 flex justify-end pb-1">
          {/* Once ordered the brief has named the moves and is locked
              (v1.5 R2): a status with its icon, not a control. Before, the
              row opens PROCURE at the brief, which says so first. One
              control, no sentence (v1.6 R3's fresh eyes, H15). */}
          {brief === 'ordered' ? (
            <span data-brief-locked className="flex min-h-11 flex-none items-center gap-1 font-mono text-[10px] tracking-wider text-dc-go">
              <PixelSprite sprite={tinted(ICON_LOCK, 'go')} scale={1} name="brief-lock" />
              {briefLockedRow(briefPrice)}
            </span>
          ) : (
            <button
              type="button"
              data-brief-order
              onClick={onOrderBrief}
              className="dc-tile min-h-11 flex-none border-2 border-dc-line bg-dc-chrome px-2 font-mono text-[10px] tracking-wider text-dc-ink shadow-press active:shadow-none"
            >
              {briefButton(briefPrice)}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
