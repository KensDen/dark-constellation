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

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { BLOCK_TONE, HEAD_TONE, LABEL, PRIMARY, TAG_TONE, useMore, useOnce, type Play } from './kit'
import type { ThreatEvent } from '../../engine/types'
import { CONDITION_CUES, MOMENT_CUES } from '../../cues'
import { shortName, turnsLeft } from '../board/boardModel'
import { techniqueLabel } from '../labels'
import { LearnMore } from '../learnMore'
import { assetSprite } from '../sprites/assets'
import { ICON_CHECK, ICON_CROSS, ICON_SPARK, tinted } from '../sprites/icons'
import PixelSprite from '../sprites/PixelSprite'
import DotField from './DotField'
import * as copy from './nightCopy'
import { defensesFor, resultOf, scoreDelta, stopsKnown, type NightStep } from './nightModel'

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

export function Officer({ line, held = false }: { line: string; held?: boolean }) {
  return (
    <p data-officer={held ? 'held' : 'hit'} className="text-sm">
      <span className={`block ${LABEL} ${held ? 'text-dc-go' : 'text-dc-hostile'}`}>{copy.WATCH_OFFICER}</span>
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
const RESULT_TONE = { BLOCKED: 'go', PARTIAL: 'warn', HIT: 'hostile' } as const
function ResultPanel({ step, reduced }: { step: NightStep; reduced: boolean }) {
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
          return (
            <span
              key={k}
              data-tile={blocked ? 'blocked' : 'through'}
              style={reduced ? undefined : { animationDelay: `${250 + k * 220}ms` }}
              className={`flex h-7 w-7 items-center justify-center ${blocked ? 'bg-dc-go' : 'bg-dc-hostile'} ${reduced ? '' : blocked ? 'dc-tile-in' : 'dc-tile-hit'}`}
            >
              <PixelSprite sprite={tinted(blocked ? ICON_CHECK : ICON_CROSS, 'ground')} scale={2} name={blocked ? 'tile-blocked' : 'tile-through'} />
            </span>
          )
        })}
      </div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b data-verdict className={`font-display text-[15px] leading-tight ${HEAD_TONE[tone]}`}>
          {r.verdict}
        </b>
        <span data-blocked-of className="font-mono text-[11px]">
          {copy.blockedOf(r.blocked, r.strength, r.chained)}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <b data-result-score className={`whitespace-nowrap font-display leading-none ${r.through === 0 ? 'text-[18px] text-dc-go' : 'text-[20px] text-dc-hostile'}`}>
          {big}
        </b>
        {small && <span className={`${LABEL} ${r.through === 0 || r.blocked > 0 ? 'text-dc-go' : 'text-dc-muted'}`}>{small}</span>}
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

// The target (brief 5.5 item 2): before and after sprites with the
// integrity either side, or why it was not damaged.
function Target({ step, signs }: { step: NightStep; signs: Map<string, string> }) {
  const { ev } = step
  const asset = ev.targetAssetId === undefined ? undefined : step.before.assets.find((a) => a.id === ev.targetAssetId)
  if (!asset) return null
  const damagedNow = ev.integrityAfter !== undefined && ev.integrityBefore !== undefined
  return (
    <div data-target={asset.id} className="flex items-center gap-3 bg-dc-chrome p-2">
      <span className="flex flex-none items-center gap-1.5">
        <PixelSprite sprite={assetSprite(asset.kind, damagedNow ? ev.integrityBefore! : asset.integrity)} scale={3} name="target-before" />
        {damagedNow && (
          <>
            <span aria-hidden="true" className="font-mono text-dc-muted">
              →
            </span>
            <PixelSprite sprite={assetSprite(asset.kind, ev.integrityAfter!)} scale={3} name="target-after" />
          </>
        )}
      </span>
      <p className="min-w-0 text-[13px] leading-snug">
        <b className="font-mono">{signs.get(asset.id) ?? asset.id}</b>
        <br />
        {damagedNow ? copy.integrityLine(ev.integrityBefore!, ev.integrityAfter!) : ev.effectiveSeverity > 0 ? copy.NOT_DAMAGED : copy.UNTOUCHED}
      </p>
    </div>
  )
}

// THE OUTCOME BLOCK (brief 5.5 item 2; M13 and M3).
function Outcome({ step, known, lastTurn }: { step: NightStep; known: ReadonlySet<string>; lastTurn: boolean }) {
  const { ev, def } = step
  const r = resultOf(ev)
  const scenario = step.after.scenario
  const { held, missing, partner } = defensesFor(def, step.after.counters, scenario)
  if (ev.outcome === 'held' && held) {
    return (
      <div data-outcome="held" className={`border-l-4 p-2.5 ${BLOCK_TONE.go}`}>
        <p className={HEAD_TONE.go}>
          <span className="font-display text-[11px]">{copy.HELD_WORD}</span>
          <span className="font-mono text-[11px] font-bold tracking-wider">{copy.headName(held.name)}</span>
        </p>
        <p data-can-say className="mt-1 text-[13px] text-dc-ink/85">
          <Named parts={partner ? copy.canNowSayWith(held.name, shortName(def), partner.name) : copy.canNowSay(held.name, shortName(def))} />
        </p>
      </div>
    )
  }
  if (ev.outcome === 'reduced' && held) {
    return (
      <div data-outcome="reduced" className={`border-l-4 p-2.5 ${BLOCK_TONE.warn}`}>
        <p className={HEAD_TONE.warn}>
          <span className="font-display text-[11px]">{copy.REDUCED_WORD}</span>
          <span className="font-mono text-[11px] font-bold tracking-wider">{copy.headName(held.name)}</span>
        </p>
        <p className="mt-1 text-sm">
          {copy.reducedLine(r.strength, r.through, held.name)}
          {r.chained ? ` ${copy.CHAIN_REDUCED}` : ''}
        </p>
        {missing && (
          <p className="mt-1.5 text-[13px] text-dc-ink/85">
            <Named parts={copy.finishedIt(missing.name, missing.cost)} />
          </p>
        )}
      </div>
    )
  }
  return (
    <div data-outcome="open" className={`border-l-4 p-2.5 ${BLOCK_TONE.hostile}`}>
      <p className={`font-display text-[11px] ${HEAD_TONE.hostile}`}>{copy.UNDEFENDED}</p>
      <p className="mt-1 text-sm">
        {copy.NOTHING_ANSWERS}
        {r.chained ? ` ${copy.CHAIN_OPEN}` : ''}
      </p>
      {missing && (
        <p data-would-have-helped className="mt-1.5 text-[13px] text-dc-ink/85">
          <Named parts={copy.wouldHaveHelped(missing.name, missing.cost)} /> {copy.itStops(stopsKnown(missing, def, scenario, known))}
          {lastTurn ? '' : ` ${copy.IN_PROCURE}`}
        </p>
      )}
    </div>
  )
}

// IN YOUR DOSSIER (brief 5.5 item 2; M26, M35): a threat already filed
// keeps its card one tap away, closed.
export function DossierRow({ def }: { def: ThreatEvent }) {
  const ref = def.techniqueRefs[0]
  const source = def.learnMoreCards[0]?.sources[0]
  return (
    <details data-dossier-row={def.id} className="border-2 border-dc-friendly/60 bg-dc-friendly/5 shadow-press">
      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center px-2.5 py-1.5">
        <span className={`${LABEL} text-dc-friendly`}>
          {copy.IN_DOSSIER}
          {ref ? ` · ${techniqueLabel(ref).split(' ')[0]}` : ''}
          <span className="float-right text-dc-muted">details ›</span>
        </span>
        <span className="mt-0.5 text-sm font-bold">{copy.HOOK[def.id] ?? def.name}</span>
      </summary>
      <div className="border-t border-dc-line px-2.5 py-2 text-sm">
        <p>{def.blurb}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 font-mono text-[11px] text-dc-muted">
          {ref && (
            <>
              <dt>{copy.TECHNIQUE}</dt>
              <dd className="text-dc-ink">
                {techniqueLabel(ref)} {ref.name}
              </dd>
            </>
          )}
          {source && (
            <>
              <dt>{copy.SOURCE}</dt>
              <dd className="text-dc-ink">{source.title}</dd>
            </>
          )}
        </dl>
      </div>
    </details>
  )
}

// The way on: COLLECT INTEL CARD on a first meeting, CONTINUE otherwise.
export function Onward({ first, reduced, onContinue }: { first: boolean; reduced: boolean; onContinue: (collect: boolean) => void }) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  return first ? (
    <button ref={ref} type="button" data-collect onClick={() => onContinue(true)} className={`${PRIMARY} ${reduced ? '' : 'dc-collect-glow'}`}>
      <PixelSprite sprite={tinted(ICON_SPARK, 'ground')} scale={2} name="collect-spark" />
      {copy.COLLECT}
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
  // Whether this is the first time the player meets the threat: COLLECT.
  first: boolean
  reduced: boolean
  play: Play
  onContinue: (collect: boolean) => void
}

// THE HIT CARD (brief 5.5 item 2).
export function HitCard({ step, turn, lastTurn, signs, known, first, reduced, play, onContinue }: StepCardProps) {
  const { ev, def } = step
  const r = resultOf(ev)
  const asset = ev.targetAssetId === undefined ? undefined : step.before.assets.find((a) => a.id === ev.targetAssetId)
  const sign = asset ? signs.get(asset.id) : undefined
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
  return (
    <Card
      kind="hit"
      label={`${shortName(def)}: ${r.verdict}`}
      head={copy.hitHeader(turn)}
      reduced={reduced}
      foot={<Onward first={first} reduced={reduced} onContinue={onContinue} />}
    >
      <ResultPanel step={step} reduced={reduced} />
      <div>
        <h3 data-move-name className="text-lg font-bold leading-tight">
          {shortName(def)}
        </h3>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Tag tone="muted">{copy.attackTag(def.vector)}</Tag>
          <Tag tone="muted">{copy.aimedTag(ev.effectiveSeverity > 0, asset?.layer ?? def.layers[0])}</Tag>
          {ev.condition && (
            <Tag tone="warn" cue={reduced ? '' : 'dc-chip-in'}>
              <span data-new-condition>{copy.conditionTag(ev.condition.name, turnsLeft({ remainingTurns: ev.condition.turns }, true))}</span>
            </Tag>
          )}
        </div>
      </div>
      <StreakLine step={step} reduced={reduced} />
      {/* The watch officer's line for the move (M29); on a block, what the
          defense did instead, since the attack's line reports a loss that
          did not happen (fresh-eyes review). Either names the tile the
          move was aimed at. */}
      {r.through === 0 && copy.HELD[ev.eventId] ? (
        <Officer held line={copy.aimedAt(copy.HELD[ev.eventId], ev.eventId, sign)} />
      ) : (
        copy.OFFICER[ev.eventId] && <Officer line={copy.aimedAt(copy.OFFICER[ev.eventId], ev.eventId, sign)} />
      )}
      <Target step={step} signs={signs} />
      <Outcome step={step} known={known} lastTurn={lastTurn} />
      {ev.repairCost > 0 && (
        <p data-repair-line className="font-mono text-[11px] text-dc-ink/75">
          {ev.integrityAfter === undefined ? copy.cleanupQueued(ev.repairCost) : copy.repairQueued(ev.repairCost)}
        </p>
      )}
      {!first && <DossierRow def={def} />}
    </Card>
  )
}

// THE INTEL CARD (brief 5.5 item 3): what COLLECT opens. The dossier count
// ticks up as it arrives; FILE IT files it on the device at once.
export function IntelFile({
  def,
  stoppedBy,
  filed,
  total,
  reduced,
  onFile,
}: {
  def: ThreatEvent
  // The names of the defenses that stop it, primary first.
  stoppedBy: { label: string; text: string }
  // Cards filed before this one.
  filed: number
  total: number
  reduced: boolean
  onFile: () => void
}) {
  const [n, setN] = useState(reduced ? filed + 1 : filed)
  useEffect(() => {
    if (reduced) return
    const id = window.setTimeout(() => setN(filed + 1), 450)
    return () => window.clearTimeout(id)
  }, [filed, reduced])
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  const learnMore = useContext(LearnMore)
  const body = useRef<HTMLDivElement | null>(null)
  const more = useMore(body)
  const techRef = def.techniqueRefs[0]
  const source = def.learnMoreCards[0]?.sources[0]
  return (
    <div data-intel-file={def.id} className="fixed inset-0 z-40 flex items-center justify-center bg-dc-ground p-4" role="dialog" aria-modal="true" aria-labelledby="intel-file-title">
      <div className={`flex max-h-full w-full max-w-[420px] flex-col border-2 border-dc-friendly bg-dc-panel shadow-hard ${reduced ? '' : 'dc-intel-in'}`}>
        <div className="relative flex h-24 flex-none flex-col justify-end overflow-hidden border-b border-dc-line bg-dc-chrome px-4 py-2.5">
          <DotField token={def.vector === 'environmental' ? 'warn' : 'friendly'} mode="noise" />
          <span className={`relative mb-auto self-start bg-dc-ground/80 px-2 py-0.5 ${LABEL} text-dc-go`}>{copy.NEW_INTEL}</span>
          <span className="relative font-display text-[22px] leading-none text-dc-ink">{copy.vectorWord(def.vector)}</span>
          <span className="relative mt-1 font-mono text-xs tracking-widest">→ {def.layers.join(' · ')}</span>
        </div>
        <div ref={body} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-3">
          <div className={`flex items-baseline justify-between ${LABEL} text-dc-muted`}>
            <span>{copy.DOSSIER_COUNT}</span>
            <b data-dossier-count className="text-[15px] text-dc-go">
              {n} / {total}
            </b>
          </div>
          <div className="h-1.5 overflow-hidden bg-dc-chrome">
            <i className="dc-bar-fill block h-full bg-dc-go" style={{ width: `${(n / total) * 100}%` }} />
          </div>
          <h2 id="intel-file-title" className="text-xl font-bold leading-tight">
            {shortName(def)}
          </h2>
          <p className="text-[15px] font-semibold text-dc-go">{copy.HOOK[def.id]}</p>
          <p className="text-[15px] leading-relaxed">{def.blurb}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 border-t border-dc-line pt-2.5 font-mono text-[11px] text-dc-muted">
            {techRef && (
              <>
                <dt>{copy.TECHNIQUE}</dt>
                <dd className="text-dc-ink">
                  {techniqueLabel(techRef)} {techRef.name}
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
        </div>
        {more && <MoreBelow />}
        {/* LEARN MORE and FILE IT, pinned under the thumb (rule 4). */}
        <div className="flex flex-none flex-col gap-2 border-t border-dc-line px-4 py-2.5">
          {learnMore && techRef && (
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
          <button ref={ref} type="button" data-file-it onClick={onFile} className={PRIMARY}>
            {copy.FILE_IT}
          </button>
        </div>
      </div>
    </div>
  )
}
