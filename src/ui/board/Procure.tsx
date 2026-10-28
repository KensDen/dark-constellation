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
import { EYE, ICON_CHECK, ICON_HELP, ICON_LOCK, tinted } from '../sprites/icons'
import { KIND_LAYER } from './board'
import ScrollCue from './ScrollCue'
import { BRIEF_LOCKED, BRIEF_LOCKED_LINE, BRIEF_LOCKS, BRIEF_RULE, FUNDING_LINE, defenseStatus, PROCURE_HELP_LABEL, PROCURE_HELP_SEEN_KEY, PROCURE_HOW, NOT_THIS_TURN, PROCURE_KINDS, briefLockedTag, PROCURE_LABEL, capLabel,  defenseOrderIn, defenseRule, hiddenOrder, matchNote, shortName, stopsLine, stopsTags, turns } from './boardModel'

export interface ProcureProps {
  state: GameState
  actions: TurnActions
  // The move the sheet was opened from, or the asset an order pointed at.
  focus: { move: ThreatEvent } | { kind: AssetKind } | { intel: true } | null
  onToggleAsset: (kind: AssetKind) => void
  onToggleCounter: (id: CountermeasureId) => void
  // Orders the brief, which names the moves and locks (v1.5 R2).
  onOrderBrief: () => void
  remaining: number
}

// An asset card's icon: the tile's own art, in an object of its own, so
// the card is drawn as a card and never counted as a strip tile
// (tests/render-count.dom.spec.tsx holds the strip still while PROCURE
// changes the money).
const ASSET_ICON = Object.fromEntries(PROCURE_KINDS.map((kind) => [kind, { ...assetSprite(kind, 100) }])) as Record<AssetKind, ReturnType<typeof assetSprite>>

const SECTION = 'mt-1.5 flex items-baseline justify-between border-b border-dc-line pb-0.5 font-mono text-[10px] tracking-widest text-dc-muted'

// A chip or a tag: status, tinted and borderless (section 4 rule 2).
const CHIP = 'inline-flex items-center gap-1 whitespace-nowrap px-1 py-0.5 text-[10px] leading-none'
const TAG_TONE = { stops: 'bg-dc-friendly/15 text-dc-ink', blunts: 'bg-dc-warn/15 text-dc-ink', answers: 'bg-dc-friendly/15 text-dc-ink', other: 'bg-dc-line/60 text-dc-muted' } as const

// What the card says where its cost goes: ORDERED with its check once it
// is, else the price.
function Cost({ ordered, price }: { ordered: boolean; price: number }) {
  return ordered ? (
    <span data-cost className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>
      <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="procure-ordered" />
      ORDERED
    </span>
  ) : (
    <span data-cost className={`${CHIP} bg-dc-chrome font-semibold text-dc-ink`}>
      {price} CR
    </span>
  )
}

// A TILE OF THE LOADOUT (v1.6 R4): the icon, the name in the pixel face,
// the cost and one short note, the whole tile the tap that orders it and
// the tap that cancels it; what it is in full is its accessible name.
function Tile({
  icon,
  name,
  cost,
  note,
  tone,
  dim,
  ...button
}: {
  icon: ReactNode
  name: string
  cost: ReactNode
  note: string
  tone: 'ordered' | 'match' | 'plain'
  dim: boolean
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'name' | 'children'> & { [data: `data-${string}`]: unknown }) {
  return (
    <li>
      <button
        type="button"
        {...button}
        className={`dc-tile flex h-full w-full flex-col items-center gap-0.5 border-2 px-0.5 py-1 text-center shadow-press disabled:cursor-not-allowed ${tone === 'ordered' ? 'border-dc-go bg-dc-go/10' : tone === 'match' ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'} ${dim ? 'opacity-70' : ''}`}
      >
        <span aria-hidden="true">{icon}</span>
        <span aria-hidden="true" data-card-name className="font-display text-[8px] uppercase leading-tight">
          {name}
        </span>
        <span aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5">
          {cost}
          <span className="text-[9px] leading-tight text-dc-muted">{note}</span>
        </span>
      </button>
    </li>
  )
}

// A tag as a tile says it: "Answers 2 threats not met yet" is "2 not met
// yet" on the tile, whose accessible name and blurb keep the sentence.
const tileTag = (text: string) => text.replace(/^Answers (\d+) threats? not met yet$/, '$1 not met yet')

// What a defense answers, as tags (stopsTags); the line's words are its
// accessible name, so a screen reader hears one sentence, not the chips.
function Stops({ cm, state, named, met }: { cm: Countermeasure; state: GameState; named: ReadonlySet<string>; met: ReadonlySet<string> }) {
  return (
    <span data-stops aria-label={stopsLine(cm, state, named, met)} className="contents">
      {/* Its leading tag on the tile; the whole line is the tile's
          accessible name and its blurb's first line (v1.6 R4: a second tag
          row ran off the card's foot). */}
      {stopsTags(cm, state, named, met)
        .slice(0, 1)
        .map((t) => (
          <span key={t.text} aria-hidden="true" className={`${CHIP} whitespace-normal! text-left ${TAG_TONE[t.verb]}`}>
            {tileTag(t.text)}
          </span>
        ))}
    </span>
  )
}

export default function Procure({ state, actions, focus, onToggleAsset, onToggleCounter, onOrderBrief, remaining }: ProcureProps) {
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
  const aboutCm = about ? scenario.countermeasures.find((cm) => cm.id === about) : undefined
  const intelPrice = scenario.prices.intelBrief
  return (
    <section role="dialog" aria-label="PROCURE" data-sheet="procure" className="dc-sheet-in absolute inset-0 z-30 flex flex-col border-t-2 border-dc-line bg-dc-panel px-safe text-dc-ink">
      {/* One line under the title: the night's one new defense, its state
          (v1.6 R4: three blocks of rules stood here). How the cards work,
          the rule's reason and when funding arrives stand behind "?". The
          one way out is the dock's BACK TO BOARD, under the thumb, and the
          money is the dock's REMAINING and WORST CASE. */}
      <div className="flex h-8 flex-none items-center gap-2 border-b border-dc-line px-3">
        <h2 className="font-display text-[11px] leading-none">PROCURE</h2>
        {left && (
          <p id="procure-defense-rule" data-defense-status={open ? 'open' : 'in'} className={`min-w-0 flex-1 truncate font-mono text-[10px] tracking-wider ${open ? 'text-dc-go' : 'text-dc-muted'}`}>
            {defenseStatus(newDefenses(state, actions).length, NEW_DEFENSES_PER_NIGHT)}
          </p>
        )}
        <button type="button" data-procure-help={help ? 'open' : 'closed'} aria-label={PROCURE_HELP_LABEL} aria-expanded={help} onClick={() => setHelp((h) => !h)} className="-my-1.5 ml-auto flex min-h-11 min-w-11 flex-none items-center justify-center">
          <span className={`flex h-6 w-6 items-center justify-center border-2 ${help ? 'border-dc-friendly bg-dc-friendly/15' : 'border-dc-line'}`}>
            <PixelSprite sprite={tinted(ICON_HELP, help ? 'friendly' : 'ink')} scale={1} name="procure-help" />
          </span>
        </button>
      </div>
      {/* Over the loadout, not pushing it: the grid stays put under it. */}
      {help && (
        <div data-procure-how className="absolute inset-x-0 top-8 z-20 space-y-1 border-y-2 border-dc-friendly bg-dc-panel px-3 py-2 text-xs leading-snug text-dc-muted shadow-hard">
          {left && <p data-defense-rule={open ? 'open' : 'in'} className={open ? 'text-dc-go' : 'text-dc-ink'}>{open ? defenseRule(NEW_DEFENSES_PER_NIGHT) : defenseOrderIn(tonights?.name ?? '', state.turn >= scenario.totalTurns)}</p>}
          <p>
            {PROCURE_HOW} {FUNDING_LINE}
          </p>
          {!briefFree(state) && !actions.intelBrief && <p data-brief-rule>{BRIEF_RULE}</p>}
        </div>
      )}
      {/* What the sheet was opened for stays above the list (R6b fresh
          eyes); opened at the brief, the note goes once it is ordered. */}
      {focus && ('move' in focus || ('intel' in focus && !actions.intelBrief)) && (
        <p data-match-note className="flex-none border-b border-dc-line px-3 py-1 text-xs leading-snug text-dc-ink">
          {'move' in focus ? (
            <>
              <b>{shortName(focus.move)}</b>
              {matchNote(focus.move)}
              {!open && !focus.move.counters.some((id) => newDefenses(state, actions).includes(id) || state.counters.includes(id)) && ` ${NOT_THIS_TURN}`}
            </>
          ) : (
            hiddenOrder(intelPrice)
          )}
        </p>
      )}
      <div ref={body} data-procure-body className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {/* THE LOADOUT (v1.6 R4, Ken's ruling of 27 October 2026: a shop,
            not a form). The three assets and the intel brief in one row of
            tiles, then the defenses as a grid, each a whole-card tap. */}
        <ul data-procure-assets className="mt-1.5 grid grid-cols-4 gap-1">
          {PROCURE_KINDS.map((kind) => {
            const price = assetPrice(scenario, kind)
            const ordered = actions.buyAssets.some((b) => b.kind === kind)
            const late = state.turn + DEPLOY_TURNS[kind] > scenario.totalTurns
            const match = !!focus && 'kind' in focus && focus.kind === kind
            const off = !ordered && (late || !afford(price))
            return (
              <Tile
                key={kind}
                data-procure-kind={kind}
                data-match={match || undefined}
                aria-pressed={ordered}
                aria-label={`${PROCURE_LABEL[kind]}, ${price} CR, ${KIND_LAYER[kind]}, +${COVERAGE_PER_KIND[kind]} coverage, ${late ? 'arrives after the last turn' : `arrives in ${turns(DEPLOY_TURNS[kind])}`}${ordered ? ', ordered' : ''}`}
                disabled={off}
                onClick={() => onToggleAsset(kind)}
                tone={ordered ? 'ordered' : match ? 'match' : 'plain'}
                dim={off}
                icon={<PixelSprite sprite={ASSET_ICON[kind]} scale={2} name={`procure-${kind}`} />}
                name={PROCURE_LABEL[kind]}
                cost={<Cost ordered={ordered} price={price} />}
                note={late ? 'TOO LATE' : `+${COVERAGE_PER_KIND[kind]} · ${DEPLOY_TURNS[kind]}T`}
              />
            )
          })}
          {briefFree(state) ? (
            <li data-procure-intel data-free className="flex flex-col items-center gap-1 border-2 border-dc-go/60 bg-dc-go/10 p-1 text-center">
              <PixelSprite sprite={EYE} scale={2} name="procure-brief" />
              <span data-card-name className="font-display text-[8px] uppercase leading-tight">INTEL BRIEF</span>
              <span className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>FREE</span>
              <span className="text-[9px] leading-tight text-dc-muted">TONIGHT</span>
            </li>
          ) : actions.intelBrief ? (
            // Ordered, it has named the moves, and the order is locked for
            // the turn (v1.5 R2): a status with its padlock, not a control.
            <li data-procure-intel data-locked aria-label={`Intel brief, ${briefLockedTag(intelPrice)}. ${BRIEF_LOCKED_LINE}`} className="flex flex-col items-center gap-1 border-2 border-dc-go/60 bg-dc-go/10 p-1 text-center">
              <PixelSprite sprite={EYE} scale={2} name="procure-brief" />
              <span data-card-name className="font-display text-[8px] uppercase leading-tight">INTEL BRIEF</span>
              <span className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>
                <PixelSprite sprite={tinted(ICON_LOCK, 'go')} scale={1} name="procure-brief-lock" />
                {BRIEF_LOCKED}
              </span>
              <span className="text-[9px] leading-tight text-dc-muted">{intelPrice} CR</span>
            </li>
          ) : (
            <Tile
              data-procure-intel
              data-match={(focus && 'intel' in focus) || undefined}
              aria-pressed={false}
              aria-label={`Intel brief, ${intelPrice} CR. ${BRIEF_RULE}`}
              disabled={!afford(intelPrice)}
              onClick={onOrderBrief}
              tone={focus && 'intel' in focus ? 'match' : 'plain'}
              dim={!afford(intelPrice)}
              icon={<PixelSprite sprite={EYE} scale={2} name="procure-brief" />}
              name="INTEL BRIEF"
              cost={<Cost ordered={false} price={intelPrice} />}
              note={BRIEF_LOCKS}
            />
          )}
        </ul>

        <p className={SECTION}>
          <span>DEFENSES</span>
          <span>+{upkeep} CR a turn each to keep</span>
        </p>
        <ul className="mt-1 grid grid-cols-2 gap-1" data-procure-defenses>
          {scenario.countermeasures.map((cm) => {
            const owned = state.counters.includes(cm.id)
            const ordered = actions.buyCounters.includes(cm.id)
            const match = !!stops && stops.has(cm.id)
            // Not tonight: another new defense is already ordered.
            const capped = !owned && !ordered && !open
            const off = owned || capped || (!ordered && !afford(cm.cost))
            const reading = about === cm.id
            return (
              <li key={cm.id} className="relative">
                <button
                  type="button"
                  data-procure-defense={cm.id}
                  data-match={match || undefined}
                  data-capped={capped || undefined}
                  aria-pressed={owned || ordered}
                  aria-describedby={capped ? 'procure-defense-rule' : undefined}
                  disabled={off}
                  onClick={() => onToggleCounter(cm.id)}
                  className={`dc-tile grid h-full w-full grid-cols-[18px_1fr] items-start gap-x-1.5 gap-y-0.5 border-2 px-1.5 pt-1 pb-0.5 text-left shadow-press disabled:cursor-not-allowed ${ordered ? 'border-dc-go bg-dc-go/10' : match ? 'border-dc-friendly bg-dc-friendly/10' : 'border-dc-line bg-dc-chrome'} ${!owned && off ? 'opacity-70' : ''}`}
                >
                  <span aria-hidden="true" className="flex justify-center pt-0.5">
                    <PixelSprite sprite={DEFENSE_ICONS[cm.id]} scale={2} name={`defense-${cm.id}`} />
                  </span>
                  <span data-card-name className="text-[11px] font-semibold leading-tight">
                    {cm.name}
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center gap-1 pr-6">
                    {owned ? (
                      <span data-cost className={`${CHIP} bg-dc-go/20 font-semibold text-dc-go`}>
                        <PixelSprite sprite={tinted(ICON_CHECK, 'go')} scale={1} name="procure-owned" />
                        OWNED
                      </span>
                    ) : capped ? (
                      <span data-cost className={`${CHIP} bg-dc-line/60 font-semibold text-dc-muted`}>
                        {capLabel(NEW_DEFENSES_PER_NIGHT)} · {cm.cost} CR
                      </span>
                    ) : (
                      <Cost ordered={ordered} price={cm.cost} />
                    )}
                    <Stops cm={cm} state={state} named={named} met={met} />
                  </span>
                </button>
                <button
                  type="button"
                  data-procure-about={cm.id}
                  aria-expanded={reading}
                  aria-label={`Read about ${cm.name}`}
                  onClick={() => setAbout(reading ? null : cm.id)}
                  className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center"
                >
                  <span className={`flex h-5 w-5 items-center justify-center border-2 font-display text-[9px] ${reading ? 'border-dc-friendly bg-dc-friendly text-dc-ground' : 'border-dc-line bg-dc-panel text-dc-ink'}`}>?</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {/* A defense's blurb over the foot of the sheet, so reading one never
          pushes the grid into a scroll. Its "?" closes it. */}
      {aboutCm && (
        <div data-procure-blurb={aboutCm.id} className="absolute inset-x-0 bottom-0 z-20 border-t-2 border-dc-friendly bg-dc-chrome px-3 py-2 text-xs leading-snug shadow-hard">
          <p className="font-semibold text-dc-ink">{aboutCm.name}</p>
          <p className="mt-0.5 text-dc-ink">{stopsLine(aboutCm, state, named, met)}</p>
          <p className="mt-0.5 text-dc-muted">{aboutCm.blurb}</p>
        </div>
      )}
      {more && <ScrollCue data-scroll-cue className="relative -mt-9 flex-none" />}
    </section>
  )
}
