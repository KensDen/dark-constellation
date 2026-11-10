// THE NIGHT'S CARDS (v1.3 brief 5.5 items 2 to 6). Each is a bottom card
// over the board with its one way on pinned under the thumb (section 4
// rule 4), and each is tapped through: nothing here advances on its own.
//
// Status never looks like a control (section 4 rule 2): the result panel,
// the outcome blocks, the tags and the odds are tinted or ruled at one
// edge, with no border around them; the buttons and the dossier row,
// which act, carry the border and the press shadow.
//
// Everything a card states is the engine's record of the night, read
// through ./nightModel; its words are ./nightCopy's.

import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { BLOCK_TONE, CHOICE, HEAD_TONE, LABEL, PRIMARY, TAG_TONE, useMore, useOnce, type Play } from './kit'
import { RESPONSE_TEXT } from '../../content/responseText'
import type { ResponseOption } from '../../engine/responses'
import { RESPONSE_DAMAGE_SHARE, billAfter } from '../../engine/rules'
import type { Scenario, ThreatEvent } from '../../engine/types'
import { CONDITION_CUES, MOMENT_CUES } from '../../cues'
import { shortName, stoppedByLine, turnsLeft } from '../board/boardModel'
import { techniqueLabel } from '../labels'
import { LearnMore } from '../learnMore'
import { ICON_CHECK, ICON_CROSS, ICON_DOWN, ICON_HALF, ICON_SPARK, tinted } from '../sprites/icons'
import PixelSprite from '../sprites/PixelSprite'
import { EMBLEMS } from '../sprites/emblems'
import * as copy from './nightCopy'
import { blockedByResponse, defensesFor, exposedOf, resultOf, scoreDelta, stopsKnown, type NightStep } from './nightModel'

export function Tag({ tone, cue, children }: { tone: keyof typeof TAG_TONE; cue?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wider ${TAG_TONE[tone]} ${cue ?? ''}`}>{children}</span>
}

// THE CARD (brief 5.5): a header line, a body that scrolls on a short
// phone, and the way on pinned below it.
export function Card({
  kind,
  label,
  head,
  right,
  foot,
  reduced,
  children,
}: {
  kind: string
  label: string
  head: string
  right?: ReactNode
  foot: ReactNode
  reduced: boolean
  children: ReactNode
}) {
  const body = useRef<HTMLDivElement | null>(null)
  const more = useMore(body)
  // In the board's flow, under the strip, filling the screen down to its
  // foot: the strip stays in view above it, and no gap opens on a tall
  // phone (fresh-eyes review at 390x844).
  return (
    <section
      data-night-card={kind}
      aria-label={label}
      className={`-mx-3 flex min-h-[280px] flex-1 flex-col border-t-2 border-dc-line bg-dc-panel text-dc-ink px-safe pb-safe ${reduced ? '' : 'dc-card-rise'}`}
    >
      <header className="flex flex-none items-center justify-between gap-2 border-b border-dc-line px-3 py-2 font-mono text-[11px] tracking-widest">
        <h2 data-card-head className="min-w-0 truncate">
          {head}
        </h2>
        {right}
      </header>
      <div ref={body} data-card-body className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-3 py-2.5">
        {children}
      </div>
      {/* On a row of its own between the body and the way on, never over
          the last line (second fresh-eyes pass). */}
      {more && <MoreBelow />}
      <footer className="flex flex-none flex-col gap-2 border-t border-dc-line px-3 py-2">{foot}</footer>
    </section>
  )
}


export function MoreBelow() {
  return (
    <p data-more aria-hidden="true" className="flex-none border-t border-dc-line/60 py-0.5 text-center font-mono text-[10px] tracking-widest text-dc-ink">
      {copy.MORE}
    </p>
  )
}

// A line with the board's call signs (SG-1, SG-R1, KESTREL-2, GS-1) kept
// whole, so none breaks at its hyphen at the end of a line.
const SIGN = /(\b[A-Z]+-R?\d+\b)/
export function Signed({ text }: { text: string }) {
  return (
    <>
      {text.split(SIGN).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

export function Officer({ line, held = false, clock }: { line: string; held?: boolean; clock?: string }) {
  return (
    <p data-officer={held ? 'held' : 'hit'} className="text-sm">
      <span data-officer-clock={clock} className={`block ${LABEL} ${held ? 'text-dc-go' : 'text-dc-hostile'}`}>{clock ? copy.officerLabel(clock) : copy.WATCH_OFFICER}</span>
      <Signed text={line} />
    </p>
  )
}

// A line that names a defense (and a threat) in bold, as the prototype's
// buy lines do.
export function Named({ parts }: { parts: readonly string[] }) {
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} className="font-bold text-dc-ink">
            {p}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

// THE RESULT PANEL (brief 5.5 item 2): one tile per point of strength,
// blocked first, then the verdict, "x of y blocked" and the streak, and
// what it cost on the right.
const RESULT_TONE = { BLOCKED: 'go', PARTIAL: 'warn', HALVED: 'warn', HIT: 'hostile' } as const
// v1.6 R3 (Ken's playtest item 3): on the hit card the panel also says
// UNDEFENDED, which stood in a block of its own lower down, and the repair
// bill the hit queued, which stood on a line of its own under it.
function ResultPanel({ step, reduced, undefended = false, repair = '' }: { step: NightStep; reduced: boolean; undefended?: boolean; repair?: string }) {
  const compact = false
  const r = resultOf(step.ev)
  const tone = RESULT_TONE[r.verdict]
  const d = scoreDelta(step)
  const saved = step.ev.saved
  // A block reads as a win at a glance: NO LOSS where a hit shows its cost
  // (fresh-eyes review: the unchanged score there read as nothing at all).
  // On a block what the defense saved is the big number, as a hit's cost
  // is (second fresh-eyes pass), with the brief's NO LOSS · SAVED under it.
  // A block's big word is NO LOSS, its saved points beside it (v1.3 R5
  // fresh-eyes review: "+1.2" read as points added to a score that never
  // moved).
  const big = r.through === 0 ? copy.NO_LOSS : d.toFixed(1)
  const small =
    r.through === 0 ? (saved > 0.05 ? copy.savedLabel(saved) : '') : r.blocked > 0 && saved > 0.05 ? copy.savedLabel(saved) : copy.SCORE_WORD
  return (
    <div data-result={r.verdict.toLowerCase()} className={`grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border-l-4 p-2.5 ${BLOCK_TONE[tone]}`}>
      <div className="flex flex-col gap-0.5">
      <span className={`${LABEL} text-dc-muted`}>{copy.STRENGTH}</span>
      <div data-result-tiles className="flex gap-1">
        {Array.from({ length: r.strength }, (_, k) => {
          const blocked = k < r.blocked
          // A halved point is its own tile: through, at half (v1.7 R1).
          const halved = !blocked && r.halved > 0
          return (
            <span
              key={k}
              data-tile={blocked ? 'blocked' : halved ? 'halved' : 'through'}
              style={reduced ? undefined : { animationDelay: `${250 + k * 220}ms` }}
              className={`flex h-7 w-7 items-center justify-center ${blocked ? 'bg-dc-go' : halved ? 'bg-dc-warn' : 'bg-dc-hostile'} ${reduced ? '' : blocked ? 'dc-tile-in' : 'dc-tile-hit'}`}
            >
              <PixelSprite sprite={tinted(blocked ? ICON_CHECK : halved ? ICON_HALF : ICON_CROSS, 'ground')} scale={2} name={blocked ? 'tile-blocked' : halved ? 'tile-halved' : 'tile-through'} />
            </span>
          )
        })}
      </div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* On the strike's card the banner over it says the verdict (v1.6
            R3), so the panel keeps the count. */}
        {!compact && (
          <b data-verdict className={`font-display text-[15px] leading-tight ${HEAD_TONE[tone]}`}>
            {r.verdict}
          </b>
        )}
        {/* UNDEFENDED in the count's place on a move nothing answered: the
            tiles show none blocked (v1.6 R3's fresh eyes, H7). */}
        {undefended ? (
          <span data-undefended className={`${LABEL} text-dc-hostile`}>
            {copy.UNDEFENDED}
          </span>
        ) : (
          <span data-blocked-of className="font-mono text-[11px]">
            {r.halved ? copy.halvedOf(r.halved, r.strength) : copy.blockedOf(r.blocked, r.strength, r.chained)}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <b data-result-score className={`whitespace-nowrap font-display leading-none ${compact ? 'text-[14px]' : r.through === 0 ? 'text-[18px]' : 'text-[20px]'} ${r.through === 0 ? 'text-dc-go' : 'text-dc-hostile'}`}>
          {big}
        </b>
        {small && <span className={`${LABEL} ${r.through === 0 || r.blocked > 0 ? 'text-dc-go' : 'text-dc-muted'}`}>{small}</span>}
        {repair && (
          <span data-repair-line className={`${LABEL} whitespace-nowrap text-dc-warn`}>
            {repair}
          </span>
        )}
      </div>
    </div>
  )
}

// The defense streak on a block, on a line of its own under the panel.
function StreakLine({ step, reduced }: { step: NightStep; reduced: boolean }) {
  if (step.ev.effectiveSeverity > 0 || step.streak < 2) return null
  return (
    <p data-streak-line className={`flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-dc-go ${reduced ? '' : 'dc-chip-in'}`}>
      <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="streak-check" />
      {copy.streakLine(step.streak)}
    </p>
  )
}

// THE OUTCOME BLOCK (brief 5.5 item 2; M13 and M3): what would answer
// the move. Since v1.6 R3 (Ken's playtest item 3, and the round's fresh
// eyes, H8) it names the defense once, in its line: the panel above says
// BLOCKED or PARTIAL and the count, and an open move's UNDEFENDED and
// "Nothing you own answers this." moved into the panel as its one word.
function Outcome({ step, known, lastTurn, options }: { step: NightStep; known: ReadonlySet<string>; lastTurn: boolean; options: readonly ResponseOption[] }) {
  const { ev, def } = step
  const r = resultOf(ev)
  const scenario = step.after.scenario
  const { held, missing, partner } = defensesFor(def, step.after.counters, scenario)
  if (ev.outcome === 'held' && held && !blockedByResponse(ev)) {
    return (
      <div data-outcome="held" className={`flex items-start gap-1.5 border-l-4 p-2.5 ${BLOCK_TONE.go}`}>
        <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="outcome-held" className="mt-1 flex-none" />
        <p data-can-say className="text-[13px] text-dc-ink/85">
          <Named parts={partner ? copy.canNowSayWith(held.name, shortName(def), partner.name) : copy.canNowSay(held.name, shortName(def))} />
        </p>
      </div>
    )
  }
  // The lasting answer: the defense that would have met it. After a
  // response it is said in the response's tone (v1.7 R1): tonight is
  // covered, and the defense covers every night.
  // Ridden out: the answer the night offered and the budget could meet.
  const could = ev.response ? undefined : options.find((o) => o.fits)
  const helped = missing && (
    <p data-would-have-helped className="text-[13px] text-dc-ink/85">
      <Named parts={ev.response ? copy.lastingAnswer(missing.name, missing.cost) : held ? copy.finishedIt(missing.name, missing.cost) : copy.wouldHaveHelped(missing.name, missing.cost)} />
      {held ? '' : ` ${copy.itStops(stopsKnown(missing, def, scenario, known))}`}
      {lastTurn ? '' : ` ${copy.IN_PROCURE}`}
    </p>
  )
  if (ev.response) {
    const tone = ev.response.effect === 'block' ? 'go' : 'warn'
    return (
      <div data-outcome="responded" className={`border-l-4 p-2.5 ${BLOCK_TONE[tone]}`}>
        <p className="text-[13px]">{copy.TONIGHT_ONLY}</p>
        {helped && <div className="mt-1">{helped}</div>}
      </div>
    )
  }
  if (!missing && !r.chained && !could && !held) return null
  return (
    <div data-outcome={held ? 'reduced' : 'open'} className={`border-l-4 p-2.5 ${BLOCK_TONE[held ? 'warn' : 'hostile']}`}>
      {held && (
        <p className="text-[13px]">
          {copy.reducedLine(held.name)}
          {r.chained ? ` ${copy.CHAIN_REDUCED}` : ''}
        </p>
      )}
      {!held && r.chained && <p className="text-[13px]">{copy.CHAIN_OPEN}</p>}
      {helped && <div className={held || r.chained ? 'mt-1' : ''}>{helped}</div>}
      {could && (
        <p data-could-have className="mt-1 text-[13px] text-dc-ink/85">
          <Named parts={copy.couldHave(RESPONSE_TEXT[def.id]?.[could.id] ?? could.id, could.cost)} />
        </p>
      )}
    </div>
  )
}

// THE DOSSIER CARD'S HEADLINE (brief 5.5 item 2; M26, M35; v1.7 R1): the
// card's hook on the move's own screen, and the whole card one tap away,
// closed: the blurb, the technique, what stops it, the source and LEARN
// MORE. A move met for the first time says NEW DOSSIER CARD, and FILE TO
// DOSSIER under it files it; one already filed says so.
export function DossierRow({ def, fresh = false, scenario, children }: { def: ThreatEvent; fresh?: boolean; scenario: Scenario; children?: ReactNode }) {
  const ref = def.techniqueRefs[0]
  const source = def.learnMoreCards[0]?.sources[0]
  const learnMore = useContext(LearnMore)
  const stoppedBy = stoppedByLine(def, scenario)
  return (
    <details data-dossier-row={def.id} data-fresh={fresh || undefined} className="border-2 border-dc-friendly/60 bg-dc-friendly/5 shadow-press">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 px-2.5 py-1.5">
        {EMBLEMS[def.id] && <PixelSprite sprite={EMBLEMS[def.id]} scale={2} name={`emblem.${def.id}`} className="flex-none bg-dc-ground/60" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`flex items-center justify-between ${LABEL} ${fresh ? 'text-dc-go' : 'text-dc-friendly'}`}>
            <span>
              {fresh ? copy.NEW_DOSSIER : copy.IN_DOSSIER}
              {ref ? ` · ${techniqueLabel(ref).split(' ')[0]}` : ''}
            </span>
            {/* A pixel arrow that turns as the row opens, not a "details ›"
                (v1.6 R3: no text-link chevrons on the night's cards). */}
            <span className="flex items-center gap-1">
              <span>{copy.READ_CARD}</span>
              <PixelSprite sprite={tinted(ICON_DOWN, 'friendly')} scale={1} name="dossier-row-open" className="dc-open-turn flex-none" />
            </span>
          </span>
          <span className="mt-0.5 text-sm font-bold">{copy.HOOK[def.id] ?? def.name}</span>
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-dc-line px-2.5 py-2 text-sm">
        {children}
        <p>{def.blurb}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 font-mono text-[11px] text-dc-muted">
          {ref && (
            <>
              <dt>{copy.TECHNIQUE}</dt>
              <dd className="text-dc-ink">
                {techniqueLabel(ref)} {ref.name}
              </dd>
            </>
          )}
          <dt>{stoppedBy.label}</dt>
          <dd className="text-dc-ink">{stoppedBy.text}</dd>
          {source && (
            <>
              <dt>{copy.SOURCE}</dt>
              <dd className="text-dc-ink">{source.title}</dd>
            </>
          )}
        </dl>
        {learnMore && ref && (
          <button
            type="button"
            data-learn-more={def.id}
            aria-haspopup="dialog"
            onClick={(e) => learnMore(def.id, e.currentTarget)}
            className="min-h-11 w-full border-2 border-dc-go bg-dc-go/10 font-display text-[11px] text-dc-go shadow-press"
          >
            LEARN MORE<span className="sr-only"> in the Field Library: {shortName(def)}</span>
          </button>
        )}
      </div>
    </details>
  )
}

// The way on: FILE TO DOSSIER on a first meeting, CONTINUE otherwise. FILE
// TO DOSSIER files the card at once and the button becomes its stamp,
// FILED with the Dossier's count, for a beat before the night goes on
// (v1.7 R1: the stamp stood on a card of its own, a second tap away).
export const FILED_BEAT_MS = 520
export function Onward({ first, reduced, filed, onContinue }: { first: boolean; reduced: boolean; filed?: { n: number; total: number } | null; onContinue: (collect: boolean) => void }) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  if (filed) {
    return (
      <p data-filed-stamp role="status" className={`flex min-h-12 w-full items-center justify-center gap-2 border-2 border-dc-go bg-dc-go/10 font-display text-xs text-dc-go ${reduced ? '' : 'dc-intel-in'}`}>
        <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={2} name="filed-check" />
        {copy.filedCount(filed.n, filed.total)}
      </p>
    )
  }
  return first ? (
    <button ref={ref} type="button" data-collect onClick={() => onContinue(true)} className={`${PRIMARY} ${reduced ? '' : 'dc-collect-glow'}`}>
      <PixelSprite sprite={tinted(ICON_SPARK, 'ground')} scale={2} name="collect-spark" />
      {copy.FILE_TO_DOSSIER}
    </button>
  ) : (
    <button ref={ref} type="button" data-continue onClick={() => onContinue(false)} className={PRIMARY}>
      {copy.CONTINUE}
    </button>
  )
}

export interface StepCardProps {
  step: NightStep
  turn: number
  lastTurn: boolean
  signs: Map<string, string>
  known: ReadonlySet<string>
  // Whether this is the first time the player meets the threat: FILE TO
  // DOSSIER.
  first: boolean
  // Set once FILE TO DOSSIER has filed it: the Dossier's count, stamped.
  filed?: { n: number; total: number } | null
  reduced: boolean
  play: Play
  onContinue: (collect: boolean) => void
}

// A move's name with where it is aimed and, on the result, the condition
// it left.
function MoveHead({ step, signs, landed, reduced, children }: { step: NightStep; signs: Map<string, string>; landed: boolean | null; reduced: boolean; children?: ReactNode }) {
  const { ev, def } = step
  const asset = ev.targetAssetId === undefined ? undefined : step.before.assets.find((a) => a.id === ev.targetAssetId)
  return (
    <div>
      <h3 data-move-name className="text-lg font-bold leading-tight">
        {shortName(def)}
      </h3>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Tag tone="muted">{copy.aimedTag(landed === true, asset?.layer ?? def.layers[0])}</Tag>
        {asset && <Tag tone="muted">{signs.get(asset.id) ?? asset.id}</Tag>}
        {children}
        {landed !== null && ev.condition && (
          <Tag tone="warn" cue={reduced ? '' : 'dc-chip-in'}>
            <span data-new-condition>{copy.conditionTag(ev.condition.name, turnsLeft({ remainingTurns: ev.condition.turns }, true))}</span>
          </Tag>
        )}
      </div>
    </div>
  )
}

// THE RESPONSE (v1.7 R1, Ken's ruling of 9 November 2026: a decision in
// the night). The night stops on a move that would land, on one screen:
// the move, what of it gets through, and two or three answers, each a
// button that says its cost and what it does in numbers. Nothing else to
// tap until the player chooses. `outcomes` is the score's change under
// each answer, from the engine's own resolution of it (null first: ridden
// out); an answer the budget cannot meet is shown and cannot be taken.
export interface ResponseCardProps {
  step: NightStep
  turn: number
  of: number
  signs: Map<string, string>
  options: readonly ResponseOption[]
  // The score's change under each option, by id, and under riding it out.
  outcomes: ReadonlyMap<string | null, { score: number; repair: number }>
  reduced: boolean
  onRespond: (id: string | null) => void
}
export function ResponseCard({ step, turn, of, signs, options, outcomes, reduced, onRespond }: ResponseCardProps) {
  const { ev, def } = step
  const exposed = exposedOf(ev)
  const strength = ev.baseSeverity + ev.chainBonus
  const { held } = defensesFor(def, step.before.counters, step.before.scenario)
  const first = useRef<HTMLButtonElement | null>(null)
  useEffect(() => first.current?.focus({ preventScroll: true }), [])
  // What the budget has free for an answer once tonight's bills are held.
  const free = ev.room ?? 0
  const rode = outcomes.get(null) ?? { score: 0, repair: 0 }
  return (
    <Card
      kind="respond"
      label={`${shortName(def)}: ${copy.YOUR_RESPONSE}`}
      head={copy.incomingHeader(turn)}
      right={of > 1 ? <span className="flex-none text-dc-muted">{copy.moveOf(step.index + 1, of).replace('TONIGHT · ', '')}</span> : undefined}
      reduced={reduced}
      // The answers stand in the card's foot, pinned under the thumb like
      // the debris call's two, so every one of them and "Ride it out" is
      // on screen on the shortest phone whatever the strip above takes
      // (v1.7 R1's layout pass: at 375x667 with three drones up, "Ride it
      // out" stood below the fold).
      foot={
        <>
          <p className={`flex items-baseline justify-between gap-2 ${LABEL}`}>
            <span className="text-dc-hostile">
              {copy.YOUR_RESPONSE}
              <span className="ml-2 text-dc-muted">{copy.ONE_A_NIGHT}</span>
            </span>
            <span data-response-budget className="flex-none text-dc-muted">
              {copy.budgetNow(step.before.credits)}
            </span>
          </p>
          <div data-responses role="group" aria-label={copy.YOUR_RESPONSE} className="flex flex-col gap-1.5">
            {options.map((o, k) => {
              const label = RESPONSE_TEXT[def.id]?.[o.id] ?? o.id
              // An option that cannot be taken has no figure to state: the
              // engine rides such a move out, so `outcomes` holds the full
              // hit for it, and its name said "Blocks it: score -4.5" (v1.7
              // R1 test repair). It says what it would do, and why not.
              const effect = o.fits ? copy.effectLine(o.effect, outcomes.get(o.id)?.score ?? 0, outcomes.get(o.id)?.repair) : copy.EFFECT_WORD[o.effect]
              // What is free for this option is the room less what is left of
              // the move's own repair bill once it is taken (rules.ts,
              // responseFits): the room alone read "12 CR ... 16 CR free" on a
              // halving the engine refuses (v1.7 R1 test repair).
              const why = o.fits ? '' : o.why === 'used' ? copy.ALREADY_ANSWERED : copy.cannotAfford(free - billAfter(def, exposed, RESPONSE_DAMAGE_SHARE[o.effect], step.before.difficulty))
              return (
                <button
                  key={o.id}
                  ref={k === 0 ? first : undefined}
                  type="button"
                  data-response={o.id}
                  data-effect={o.effect}
                  disabled={!o.fits}
                  aria-label={`${label}. ${copy.crFace(o.cost)}. ${effect}.${why ? ` ${why}.` : ''}`}
                  onClick={() => onRespond(o.id)}
                  className={`${CHOICE} py-1.5! ${o.fits ? '' : 'opacity-60'}`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <b className="text-[15px] font-bold leading-tight text-dc-ink">{label}</b>
                    <span className={`flex-none font-display text-[11px] ${o.fits ? 'text-dc-ink' : 'text-dc-hostile'}`}>{copy.crFace(o.cost)}</span>
                  </span>
                  <span className={`${LABEL} ${o.fits ? (o.effect === 'block' ? 'text-dc-go' : 'text-dc-warn') : 'text-dc-hostile'}`}>{why || effect}</span>
                </button>
              )
            })}
            <button
              type="button"
              data-response="ride"
              aria-label={`${copy.RIDE_IT_OUT}. ${copy.FREE}. ${copy.effectLine('ride', rode.score, rode.repair)}.`}
              onClick={() => onRespond(null)}
              className={`${CHOICE} py-1.5!`}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <b className="text-[15px] font-bold leading-tight text-dc-ink">{copy.RIDE_IT_OUT}</b>
                <span className="flex-none font-display text-[11px] text-dc-muted">{copy.FREE}</span>
              </span>
              <span className={`${LABEL} text-dc-hostile`}>{copy.effectLine('ride', rode.score, rode.repair)}</span>
            </button>
          </div>
        </>
      }
    >
      {/* The chain's point is a tag: its sentence took the line that put
          the card past a 375x667 screen (v1.7 R1's layout pass). */}
      <MoveHead step={step} signs={signs} landed={null} reduced={reduced}>
        {ev.chainBonus > 0 && (
          <Tag tone="warn">
            <span data-chain-tag>{copy.CHAIN_ADDS}</span>
          </Tag>
        )}
      </MoveHead>
      <p data-exposed className="text-[13px] text-dc-ink/85">
        {copy.exposedLine(strength, exposed, held?.name)}
      </p>
    </Card>
  )
}

// THE RESULT (brief 5.5 item 2; one screen a strike since v1.7 R1): what
// the move did, what the player did about it, what would have helped, and
// its Dossier card's headline, with FILE TO DOSSIER on a first meeting.
export function HitCard({ step, turn, lastTurn, signs, known, first, filed, reduced, play, onContinue, options = [] }: StepCardProps & { options?: readonly ResponseOption[] }) {
  const { ev, def } = step
  const r = resultOf(ev)
  const asset = ev.targetAssetId === undefined ? undefined : step.before.assets.find((a) => a.id === ev.targetAssetId)
  const sign = asset ? signs.get(asset.id) : undefined
  const officer = copy.officerFor(step, sign)
  // The tiles tick as they land, then a new condition sounds its alarm and
  // a streak its fanfare (brief 8.4).
  useOnce(() => {
    const ids: number[] = []
    for (let k = 0; k < r.strength; k += 1) ids.push(window.setTimeout(() => play(k < r.blocked ? 'tick-up' : 'tick-down'), 250 + k * 220))
    const after = 250 + r.strength * 220
    if (ev.condition) {
      const alarm = CONDITION_CUES[ev.eventId]?.sound ?? MOMENT_CUES.condition.sound
      ids.push(window.setTimeout(() => play(alarm), after))
    }
    if (r.through === 0 && step.streak >= 2) ids.push(window.setTimeout(() => play(MOMENT_CUES.streak.sound), after))
    return () => ids.forEach((id) => window.clearTimeout(id))
  })
  const defended = !!defensesFor(def, step.after.counters, step.after.scenario).held
  return (
    <Card
      kind="hit"
      label={`${shortName(def)}: ${r.verdict}`}
      head={copy.hitHeader(turn)}
      reduced={reduced}
      foot={<Onward first={first} filed={filed} reduced={reduced} onContinue={onContinue} />}
    >
      <ResultPanel step={step} reduced={reduced} undefended={!defended && !ev.response} repair={ev.repairCost > 0 ? copy.repairTag(ev.repairCost, ev.integrityAfter !== undefined) : ''} />
      <MoveHead step={step} signs={signs} landed={ev.effectiveSeverity > 0} reduced={reduced}>
        {ev.room !== undefined && !ev.response && (
          <Tag tone="muted">
            <span data-response-taken="ride">{copy.RODE_OUT}</span>
          </Tag>
        )}
      </MoveHead>
      {/* What the player did about it (v1.7 R1): the answer and its cost
          on a line; a move ridden out says so in a tag beside where it
          hit, which keeps the card to one screen at 390x844. */}
      {ev.response && (
        <p data-response-taken={ev.response.id} className="text-[13px]">
          <span className={`mr-1.5 ${LABEL} text-dc-muted`}>{copy.RESPONSE_WORD}</span>
          {copy.youDid(RESPONSE_TEXT[def.id]?.[ev.response.id] ?? ev.response.id, ev.response.cost)}
        </p>
      )}
      <StreakLine step={step} reduced={reduced} />
      <Outcome step={step} known={known} lastTurn={lastTurn} options={options} />
      {/* The Dossier card's headline stays on the screen with the result
          (v1.7 R1). The watch officer's line for the move (M29) opens with
          the card: beside the result, the response and what would have
          helped it put the headline under the fold at 390x844. On a
          defense's block it is what the defense did (fresh-eyes review);
          a move met again says it another way, on the night's own clock
          (v1.6 R3, nightCopy's officerFor). */}
      <DossierRow def={def} fresh={first} scenario={step.after.scenario}>
        {officer && <Officer held={officer.held} line={officer.line} clock={officer.clock} />}
      </DossierRow>
    </Card>
  )
}
