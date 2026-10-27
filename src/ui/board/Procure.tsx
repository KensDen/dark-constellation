// PROCURE (v1.3 brief 5.4): one sheet with ASSETS, DEFENSES and INTEL,
// replacing the v1.2 two-step sheet. Header PROCURE · n CR LEFT · ✕; the
// sheet is never remounted by a tap, so its scroll stays where it was.
// Pinned footer: CONFIRM N ORDERS with what is committed, or BACK TO BOARD
// with nothing queued.
//
// COMPACT CARDS (v1.6 R1, Ken's ruling of 26 October 2026: documents into
// game screens). Each order is a card: an icon, the name in the pixel
// face, a cost chip ("10 CR", with "+2 CR a turn" on a defense), and what
// it answers as tags, in the body face. The whole card is the tap that
// orders it and the tap that cancels it; an ordered card says ORDERED
// with its check. A defense's blurb opens behind the key in its corner.
// v1.5's cards were three paragraphs in three faces with a link-style
// "+ ADD · n CR", which read as a web list.
//
// A defense says what it stops by the earned answer key (ruling R1): a
// threat by name once it has been met on this device or named by tonight's
// intel brief, and otherwise only counted. Opened from a move, the sheet
// scrolls to the defenses and highlights the ones that stop it.
//
// One new defense a turn (v1.4): a line pinned under the header says the
// rule and its reason before the turn's defense is ordered, and once it is,
// that tonight's order is in, which one it is and how to swap; each of the
// others reads the rule, 1 A TURN, where its price was, so it never reads
// as unaffordable.

import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { candidatesTonight } from '../../engine/campaign'
import { NEW_DEFENSES_PER_NIGHT, briefActive, briefFree, defenseOpen, newDefenses } from '../../engine/rules'
import { COVERAGE_PER_KIND, assetPrice } from '../../engine/scoring'
import { DEPLOY_TURNS } from '../../engine/rules'
import type { AssetKind, Countermeasure, CountermeasureId, GameState, ThreatEvent, TurnActions } from '../../engine/types'
import { knownThreats } from '../../persistence'
import PixelSprite from '../sprites/PixelSprite'
import { assetSprite } from '../sprites/assets'
import { DEFENSE_ICONS } from '../sprites/defenses'
import { EYE, ICON_CHECK, ICON_CROSS, ICON_HELP, ICON_LOCK, tinted } from '../sprites/icons'
import { KIND_LAYER } from './board'
import ScrollCue from './ScrollCue'
import { BRIEF_LOCKED_LINE, BRIEF_RULE, FUNDING_LINE, PROCURE_HELP_LABEL, PROCURE_HELP_SEEN_KEY, PROCURE_HOW, NOT_THIS_TURN, PROCURE_KINDS, briefLockedTag, PROCURE_LABEL, capLabel, confirmNote, defenseCount, defenseOrderIn, defenseRule, defensesPerTurn, hiddenOrder, matchNote, shortName, stopsLine, stopsTags, turns } from './boardModel'

export interface ProcureProps {
  state: GameState
  actions: TurnActions
  // The move the sheet was opened from, or the asset an order pointed at.
  focus: { move: ThreatEvent } | { kind: AssetKind } | { intel: true } | null
  onToggleAsset: (kind: AssetKind) => void
  onToggleCounter: (id: CountermeasureId) => void
  // Orders the brief, which names the moves and locks (v1.5 R2).
  onOrderBrief: () => void
  onClose: () => void
  remaining: number
  cost: number
  orders: number
}

// An asset card's icon: the tile's own art, in an object of its own, so
// the card is drawn as a card and never counted as a strip tile
// (tests/render-count.dom.spec.tsx holds the strip still while PROCURE
// changes the money).
const ASSET_ICON = Object.fromEntries(PROCURE_KINDS.map((kind) => [kind, { ...assetSprite(kind, 100) }])) as Record<AssetKind, ReturnType<typeof assetSprite>>

const SECTION = 'mt-3 flex items-baseline justify-between border-b border-dc-line pb-1 font-mono text-[10px] tracking-widest text-dc-muted'

// A chip or a tag: status, tinted and borderless (section 4 rule 2).
const CHIP = 'inline-flex items-center gap-1 whitespace-nowrap px-1 py-0.5 text-[10px] leading-none'
const TAG_TONE = { stops: 'bg-dc-friendly/15 text-dc-ink', blunts: 'bg-dc-warn/15 text-dc-ink', answers: 'bg-dc-friendly/15 text-dc-ink', other: 'bg-dc-line/60 text-dc-muted' } as const

// What the card says where its cost goes: ORDERED with its check once it
// is, else the price.
function Cost({ ordered, price }: { ordered: boolean; price: number }) {
  return ordered ? (
    <span data-cost className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>
      <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="procure-ordered" />
      {price} CR · ORDERED
    </span>
  ) : (
    <span data-cost className={`${CHIP} bg-dc-chrome font-semibold text-dc-ink`}>
      {price} CR
    </span>
  )
}

// THE CARD: the icon, the name, then a row of chips and tags. The button
// is the whole card; its corner key, when it has one, sits over the top
// right, outside the button, so the two never nest.
function OrderCard({
  icon,
  name,
  chips,
  tone,
  dim,
  corner,
  children,
  ...button
}: {
  icon: ReactNode
  name: string
  chips: ReactNode
  tone: 'ordered' | 'match' | 'plain'
  dim: boolean
  corner?: ReactNode
  children?: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'name' | 'children'> & { [data: `data-${string}`]: unknown }) {
  return (
    <li className="relative">
      <button
        type="button"
        {...button}
        className={`dc-tile grid w-full grid-cols-[28px_1fr] items-center gap-x-2 gap-y-1 border-2 px-2 py-1.5 text-left shadow-press disabled:cursor-not-allowed ${corner ? 'pr-11' : ''} ${tone === 'ordered' ? 'border-dc-go bg-dc-go/10' : tone === 'match' ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'} ${dim ? 'opacity-70' : ''}`}
      >
        <span aria-hidden="true" className="row-span-2 flex items-center justify-center">
          {icon}
        </span>
        <span data-card-name className="font-display text-[9px] uppercase leading-snug">
          {name}
        </span>
        <span className="flex flex-wrap items-center gap-1">{chips}</span>
      </button>
      {corner}
      {children}
    </li>
  )
}

// What a defense answers, as tags (stopsTags); the line's words are its
// accessible name, so a screen reader hears one sentence, not the chips.
function Stops({ cm, state, named, met }: { cm: Countermeasure; state: GameState; named: ReadonlySet<string>; met: ReadonlySet<string> }) {
  return (
    <span data-stops aria-label={stopsLine(cm, state, named, met)} className="contents">
      {stopsTags(cm, state, named, met).map((t) => (
        <span key={t.text} aria-hidden="true" className={`${CHIP} ${TAG_TONE[t.verb]}`}>
          {t.text}
        </span>
      ))}
    </span>
  )
}

export default function Procure({ state, actions, focus, onToggleAsset, onToggleCounter, onOrderBrief, onClose, remaining, cost, orders }: ProcureProps) {
  const { scenario } = state
  const named = new Set(briefActive(state, actions) ? candidatesTonight(state) : [])
  const met = knownThreats()
  const upkeep = scenario.upkeepPerDefense
  const stops = focus && 'move' in focus ? new Set(focus.move.counters) : null
  const body = useRef<HTMLDivElement | null>(null)
  // Opened from a move or an order: bring what it pointed at into view.
  useEffect(() => {
    const target = body.current?.querySelector<HTMLElement>('[data-match]')
    // To the top of the list, under the pinned lines, so the card and the
    // one after it show whole (v1.6 R1's fresh eyes, F3).
    target?.scrollIntoView?.({ block: 'start' })
    // Only on opening: a tap inside the sheet must not move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The cue while the list runs on under the footer (v1.5 R2's review: on
  // the desktop's side panel a card was cut at the foot with no sign of
  // more), checked on scroll and after every render.
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  })
  const afford = (price: number) => remaining - price >= 0
  // TEACH ONCE (v1.6 R3, from Ken's notes): how the cards work, the one
  // new defense a turn and when funding arrives open on their own the
  // first time a device opens PROCURE, and stand behind "?" after.
  const [help, setHelp] = useState(() => {
    try {
      return localStorage.getItem(PROCURE_HELP_SEEN_KEY) !== '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(PROCURE_HELP_SEEN_KEY, '1')
    } catch {
      // Storage refused: the lines open on their own each time.
    }
  }, [])
  // The defense whose blurb is open behind its key, one at a time.
  const [about, setAbout] = useState<CountermeasureId | null>(null)
  // Tonight's room for a new defense, and whether any is left to order.
  const open = defenseOpen(state, actions)
  const left = scenario.countermeasures.some((cm) => !state.counters.includes(cm.id))
  // The defense ordered this turn, which the line names once it is in.
  const tonights = scenario.countermeasures.find((cm) => newDefenses(state, actions).includes(cm.id))
  return (
    <section role="dialog" aria-label="PROCURE" data-sheet="procure" className="dc-sheet-in absolute inset-x-0 bottom-0 z-30 flex max-h-[85%] flex-col border-t-2 border-dc-line bg-dc-panel px-safe text-dc-ink">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-dc-line px-3 py-1">
        <h2 className="font-mono text-xs tracking-widest">
          PROCURE · <b className={remaining < 0 ? 'text-dc-hostile' : 'text-dc-ink'}>{remaining}</b> CR LEFT
        </h2>
        <span className="flex flex-none items-center">
          <button type="button" data-procure-help={help ? 'open' : 'closed'} aria-label={PROCURE_HELP_LABEL} aria-expanded={help} onClick={() => setHelp((h) => !h)} className="flex min-h-11 min-w-11 items-center justify-center">
            <span className={`flex h-6 w-6 items-center justify-center border-2 ${help ? 'border-dc-friendly bg-dc-friendly/15' : 'border-dc-line'}`}>
              <PixelSprite sprite={tinted(ICON_HELP, help ? 'friendly' : 'ink')} scale={1} name="procure-help" />
            </span>
          </button>
          <button type="button" data-sheet-close aria-label="Close PROCURE" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center">
            <PixelSprite sprite={tinted(ICON_CROSS, 'ink')} scale={2} name="close" />
          </button>
        </span>
      </div>
      {/* The rule while tonight's defense is open is teaching, behind "?";
          once it is in, the line is the night's state and always shows. */}
      {left && (help || !open) && (
        <p id="procure-defense-rule" data-defense-rule={open ? 'open' : 'in'} className={`flex-none border-b border-dc-line px-3 py-1.5 text-xs ${open ? 'text-dc-go' : 'text-dc-ink'}`}>
          {open ? defenseRule(NEW_DEFENSES_PER_NIGHT) : defenseOrderIn(tonights?.name ?? '', state.turn >= scenario.totalTurns)}
        </p>
      )}
      {/* What the sheet was opened for stays above the list, which opens
          scrolled to the highlighted item (R6b fresh eyes: the note had
          scrolled off with the top of the list). */}
      {/* Opened at the brief, the note goes once it is ordered: its row says
          LOCKED (v1.5 R2's re-review: the sheet was crowded at 375). */}
      {focus && ('move' in focus || ('intel' in focus && !actions.intelBrief)) && (
        <p data-match-note className="flex-none border-b border-dc-line px-3 py-1.5 text-xs text-dc-ink">
          {'move' in focus ? (
            <>
              <b>{shortName(focus.move)}</b>
              {matchNote(focus.move)}
              {/* Its defenses wait for the turn's one: said, so the note
                  does not promise tonight (the R1 re-review). */}
              {!open && !focus.move.counters.some((id) => newDefenses(state, actions).includes(id) || state.counters.includes(id)) && ` ${NOT_THIS_TURN}`}
            </>
          ) : (
            hiddenOrder(scenario.prices.intelBrief)
          )}
        </p>
      )}
      <div ref={body} data-procure-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {help && !(focus && ('move' in focus || 'intel' in focus)) && (
          <p data-procure-how className="mt-1.5 text-xs text-dc-muted">{PROCURE_HOW}</p>
        )}
        <p data-planned className="mt-0.5 text-[11px] text-dc-muted">
          {left && <>{defenseCount(newDefenses(state, actions).length, NEW_DEFENSES_PER_NIGHT)} </>}
          Ordered: {cost} of {state.credits} CR.{help && ` ${FUNDING_LINE}`}
        </p>

        <p className={SECTION}>
          <span>ASSETS</span>
          <span>one-time</span>
        </p>
        <ul className="mt-2 grid gap-2">
          {PROCURE_KINDS.map((kind) => {
            const price = assetPrice(scenario, kind)
            const ordered = actions.buyAssets.some((b) => b.kind === kind)
            const late = state.turn + DEPLOY_TURNS[kind] > scenario.totalTurns
            const match = !!focus && 'kind' in focus && focus.kind === kind
            const off = !ordered && (late || !afford(price))
            return (
              <OrderCard
                key={kind}
                data-procure-kind={kind}
                data-match={match || undefined}
                aria-pressed={ordered}
                disabled={off}
                onClick={() => onToggleAsset(kind)}
                tone={ordered ? 'ordered' : match ? 'match' : 'plain'}
                dim={off}
                icon={<PixelSprite sprite={ASSET_ICON[kind]} scale={2} name={`procure-${kind}`} />}
                name={PROCURE_LABEL[kind]}
                chips={
                  late ? (
                    <span className={`${CHIP} ${TAG_TONE.other}`}>Arrives after the last turn</span>
                  ) : (
                    <>
                      <Cost ordered={ordered} price={price} />
                      <span className={`${CHIP} ${TAG_TONE.other}`}>{KIND_LAYER[kind]}</span>
                      <span className={`${CHIP} ${TAG_TONE.other}`}>+{COVERAGE_PER_KIND[kind]} coverage</span>
                      <span className={`${CHIP} ${TAG_TONE.other}`}>Arrives in {turns(DEPLOY_TURNS[kind])}</span>
                    </>
                  )
                }
              />
            )
          })}
        </ul>

        <p className={SECTION}>
          <span>DEFENSES</span>
          <span>
            {defensesPerTurn(NEW_DEFENSES_PER_NIGHT)} · {upkeep} CR a turn to keep
          </span>
        </p>
        <ul className="mt-2 grid gap-2" data-procure-defenses>
          {scenario.countermeasures.map((cm) => {
            const owned = state.counters.includes(cm.id)
            const ordered = actions.buyCounters.includes(cm.id)
            const match = !!stops && stops.has(cm.id)
            // Not tonight: another new defense is already ordered.
            const capped = !owned && !ordered && !open
            const off = owned || capped || (!ordered && !afford(cm.cost))
            const reading = about === cm.id
            return (
              <OrderCard
                key={cm.id}
                data-procure-defense={cm.id}
                data-match={match || undefined}
                data-capped={capped || undefined}
                aria-pressed={owned || ordered}
                aria-describedby={capped ? 'procure-defense-rule' : undefined}
                disabled={off}
                onClick={() => onToggleCounter(cm.id)}
                tone={ordered ? 'ordered' : match ? 'match' : 'plain'}
                dim={!owned && off}
                icon={<PixelSprite sprite={DEFENSE_ICONS[cm.id]} scale={3} name={`defense-${cm.id}`} />}
                name={cm.name}
                chips={
                  <>
                    {owned ? (
                      <span data-cost className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>
                        <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="procure-owned" />
                        OWNED · {upkeep} CR a turn
                      </span>
                    ) : capped ? (
                      <span data-cost className={`${CHIP} bg-dc-line/60 font-semibold text-dc-muted`}>
                        {capLabel(NEW_DEFENSES_PER_NIGHT)} · {cm.cost} CR
                      </span>
                    ) : (
                      <>
                        <Cost ordered={ordered} price={cm.cost} />
                        <span className={`${CHIP} ${TAG_TONE.other}`}>+{upkeep} CR a turn</span>
                      </>
                    )}
                    <Stops cm={cm} state={state} named={named} met={met} />
                  </>
                }
                corner={
                  <button
                    type="button"
                    data-procure-about={cm.id}
                    aria-expanded={reading}
                    aria-label={`Read about ${cm.name}`}
                    onClick={() => setAbout(reading ? null : cm.id)}
                    className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center"
                  >
                    <span className={`flex h-5 w-5 items-center justify-center border-2 font-display text-[9px] ${reading ? 'border-dc-friendly bg-dc-friendly text-dc-ground' : 'border-dc-line bg-dc-panel text-dc-ink'}`}>?</span>
                  </button>
                }
              >
                {reading && (
                  <div data-procure-blurb={cm.id} className="mx-1 border-l-2 border-dc-friendly bg-dc-chrome/70 px-2.5 py-1.5 text-xs leading-snug">
                    <p className="text-dc-ink">{stopsLine(cm, state, named, met)}</p>
                    <p className="mt-1 text-dc-muted">{cm.blurb}</p>
                  </div>
                )}
              </OrderCard>
            )
          })}
        </ul>

        {/* INTEL BRIEF, the one thing "intel" names (v1.6 R3, Ken's
            playtest item 4). */}
        <p className={SECTION}>
          <span>INTEL BRIEF</span>
          <span>this turn only</span>
        </p>
        <div className="mt-2">
          {briefFree(state) ? (
            <p data-procure-intel className="flex items-center gap-2.5 border-l-4 border-dc-go bg-dc-go/10 p-2 text-xs text-dc-muted">
              <PixelSprite sprite={EYE} scale={3} name="procure-brief" className="flex-none" />
              <span>
                <span className="font-display text-[10px] text-dc-ink">INTEL BRIEF</span> · FREE TONIGHT. COLDVEIL&apos;s moves are named on the TONIGHT card.
              </span>
            </p>
          ) : actions.intelBrief ? (
            // Ordered, it has named the moves, and the order is locked for
            // the turn (v1.5 R2, the engine's briefLocked): a status with
            // its icon, not a control.
            <div data-procure-intel data-locked className="grid grid-cols-[32px_1fr] items-center gap-x-2.5 gap-y-1 border-l-4 border-dc-go bg-dc-go/10 p-2">
              <span aria-hidden="true" className="row-span-2 flex justify-center">
                <PixelSprite sprite={EYE} scale={3} name="procure-brief" />
              </span>
              <span className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-display text-[10px] leading-tight">INTEL BRIEF</span>
                <span className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>
                  <PixelSprite sprite={tinted(ICON_LOCK, 'go')} scale={1} name="procure-brief-lock" />
                  {briefLockedTag(scenario.prices.intelBrief)}
                </span>
              </span>
              <span className="text-xs text-dc-muted">{BRIEF_LOCKED_LINE}</span>
            </div>
          ) : (
            <ul>
              <OrderCard
                data-procure-intel
                data-match={(focus && 'intel' in focus) || undefined}
                aria-pressed={false}
                aria-describedby="procure-brief-rule"
                disabled={!afford(scenario.prices.intelBrief)}
                onClick={onOrderBrief}
                tone={focus && 'intel' in focus ? 'match' : 'plain'}
                dim={!afford(scenario.prices.intelBrief)}
                icon={<PixelSprite sprite={EYE} scale={3} name="procure-brief" />}
                name="Intel brief"
                chips={<Cost ordered={false} price={scenario.prices.intelBrief} />}
              >
                {/* Said before the tap, not behind it: the order locks the
                    moment it names them (v1.5 R2). */}
                <p id="procure-brief-rule" data-brief-rule className="mt-1 text-xs text-dc-muted">
                  {BRIEF_RULE}
                </p>
              </OrderCard>
            </ul>
          )}
        </div>
      </div>
      {more && (
        <ScrollCue data-scroll-cue className="relative -mt-9 flex-none" />
      )}
      <div className="flex-none border-t border-dc-line px-3 pt-2 pb-2">
        {orders > 0 ? (
          <>
            <button type="button" data-confirm onClick={onClose} className="dc-tile flex min-h-12 w-full items-center justify-center border-2 border-dc-go bg-dc-go font-display text-xs text-dc-ground shadow-hard">
              CONFIRM {orders} ORDER{orders === 1 ? '' : 'S'}
            </button>
            <p className="mt-1 text-center text-[11px] text-dc-muted">{confirmNote(cost, actions.intelBrief && !briefFree(state))}</p>
          </>
        ) : (
          <button type="button" data-confirm onClick={onClose} className="dc-tile flex min-h-12 w-full items-center justify-center border-2 border-dc-line bg-dc-panel font-display text-xs text-dc-ink shadow-press">
            BACK TO BOARD
          </button>
        )}
      </div>
    </section>
  )
}

