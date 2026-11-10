// THE 3D GAME'S CARDS (v2.0 R1): what stands in the dock beside the world.
// Before the night: the signature in hand, the piece in hand, the asset,
// the fleet. In the night: the answers, the debris call, the result with
// why it held and the Dossier card. At dawn: the turn's close. Each one
// only shows what Game3D hands it; the engine's figures arrive computed.

import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { RESPONSE_TEXT } from '../../content/responseText'
import { maiScore } from '../../engine/scoring'
import type { Asset, AssetKind, CountermeasureId, DebrisChoice, GameState } from '../../engine/types'
import { COVERAGE_PER_KIND } from '../../engine/scoring'
import { shortName, stopVerb, stoppedByLine } from '../board/boardModel'
import { kindLabels, techniqueLabel } from '../labels'
import { opportunityLines, scoreRows, type callTerms } from '../night/closeModel'
import * as copy from '../night/nightCopy'
import { defensesFor, exposedOf, type Night, type NightStep } from '../night/nightModel'
import * as c3 from './copy3d'
import { PIECE, blockedBy, tapLine, verdictOf, type Choice, type Contact, type FleetPiece, type KitPiece, type Verdict } from './gameModel'
import { GestureMark, MechanismGlyph, SignatureGlyph } from './glyphs'

export const VERDICT_WORD: Record<Verdict, string> = { blocked: 'BLOCKED', halved: 'HALVED', partial: 'PARTIAL', hit: 'HIT' }
export const dots = (n: number) => '●'.repeat(Math.max(0, n))
const tenth = (n: number) => Math.round(n * 10) / 10
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`
const joined = (parts: readonly string[]) => parts.join('')
const verbWord = (v: 'stops' | 'blunts' | 'answers') => (v === 'stops' ? 'Stops' : v === 'blunts' ? 'Blunts' : 'Answers')
// The night's words say "turn" (the pixel board's); the 3D game says "night".
const nightly = (s: string) => s.replace(/\bTURNS\b/g, 'NIGHTS').replace(/\bTURN\b/g, 'NIGHT').replace(/\bturns\b/g, 'nights').replace(/\bturn\b/g, 'night')

const Close = ({ onClose }: { onClose: () => void }) => (
  <button type="button" className="t3-round t3-small" aria-label="Close" data-t3-close onClick={onClose}>
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  </button>
)

type StartDrag = (e: ReactPointerEvent<HTMLElement>, id: string, label: string) => void

// ---------------------------------------------------- before the night

// THE TRAY: the defenses as pieces to pick up, the ones that answer what
// the scan has named first, and the fleet's door at the end.
export function Tray({ kit, fleetOrdered, selected, onPick, onFleet, startDrag }: { kit: KitPiece[]; fleetOrdered: number; selected: CountermeasureId | 'fleet' | null; onPick: (id: CountermeasureId) => void; onFleet: () => void; startDrag: StartDrag }) {
  return (
    <div className="t3-tray" role="group" aria-label={`${c3.KIT}. ${c3.ONE_A_NIGHT}.`} data-t3-tray>
      <button type="button" data-t3-fleet aria-pressed={selected === 'fleet'} aria-label={`${c3.FLEET}. Order new assets.${fleetOrdered ? ` ${fleetOrdered} ordered.` : ''}`} className={`t3-piece t3-piece-fleet${selected === 'fleet' ? ' is-on' : ''}${fleetOrdered ? ' is-ordered' : ''}`} onClick={onFleet}>
        <b>{c3.FLEET}</b>
        <span>{fleetOrdered ? `${fleetOrdered} ${c3.ORDERED}` : '+ assets'}</span>
      </button>
      {kit.map((p) => {
        const hot = p.answers.some((a) => a.contact.favor !== 'unlikely' && a.contact.exposed > 0)
        const state = p.blocked === 'owned' ? c3.OWNED : p.ordered ? c3.PLACED : `${p.cm.cost} CR`
        const does = p.answers.length ? p.answers.map((a) => `${verbWord(a.verb)} ${shortName(a.contact.def)}`).join('. ') : c3.nothingKnown
        return (
          <button
            key={p.cm.id}
            type="button"
            data-t3-piece={p.cm.id}
            data-state={p.blocked ?? (p.ordered ? 'ordered' : 'free')}
            aria-pressed={selected === p.cm.id}
            aria-label={`${p.cm.name}. ${state}. ${does}.${p.blocked === 'budget' ? ' Not enough budget tonight.' : ''}${p.risky && !p.ordered ? ` ${c3.RISKY}.` : ''}`}
            data-risky={p.risky || undefined}
            className={`t3-piece${p.ordered ? ' is-ordered' : ''}${p.blocked ? ` is-${p.blocked}` : ''}${hot && !p.blocked ? ' is-hot' : ''}${p.risky && !p.ordered ? ' is-risky' : ''}${selected === p.cm.id ? ' is-on' : ''}`}
            onPointerDown={p.blocked ? undefined : (e) => startDrag(e, p.cm.id, PIECE[p.cm.id])}
            title={p.risky && !p.ordered ? c3.RISK_MARK : undefined}
            onClick={() => onPick(p.cm.id)}
          >
            <b>{PIECE[p.cm.id]}</b>
            <span>{state}</span>
          </button>
        )
      })}
    </div>
  )
}

// A SIGNATURE IN HAND. Unidentified: its look, and the scan. Identified:
// what it is, what COLDVEIL does with it, what it would take from the
// score, and the pieces that answer it.
export interface AnswerView {
  id: CountermeasureId
  name: string
  cost: number
  verb: 'stops' | 'blunts' | 'answers'
  owned: boolean
  ordered: boolean
  blocked: 'owned' | 'budget' | null
  risky: boolean
  // What COLDVEIL does once it is placed, when it moves.
  then: string
}
export function ContactCard({
  contact,
  sign,
  track,
  tracks,
  siblings,
  scanLeft,
  filed,
  answers,
  locked,
  onScan,
  onPlace,
  onClose,
}: {
  contact: Contact
  sign: string
  track: number
  tracks: number
  siblings: number
  scanLeft: number
  filed: boolean
  answers: AnswerView[]
  locked: string | null
  onScan: () => void
  onPlace: (id: CountermeasureId) => void
  onClose: () => void
}) {
  const { def } = contact
  if (!contact.known) {
    return (
      <div className="t3-card" key={`c-${contact.id}`} data-t3-card="contact" data-known="false">
        <div className="t3-head">
          <SignatureGlyph id={contact.id} size={56} named={false} className="t3-glyph-big" />
          <div className="t3-grow">
            <p className="t3-eyebrow">
              {c3.UNIDENTIFIED} · {c3.trackOf(track, tracks)}
            </p>
            <h2 className="t3-title">
              {c3.UNKNOWN_LEAD} <small>over {sign}</small>
            </h2>
          </div>
          <Close onClose={onClose} />
        </div>
        <p className="t3-hook">{c3.unknownBody(siblings)}</p>
        <button type="button" data-t3-scan={contact.id} className="t3-btn t3-primary t3-scanbtn" disabled={scanLeft <= 0} onClick={onScan}>
          {scanLeft > 0 ? c3.scanButton(scanLeft) : c3.NO_PULSES}
        </button>
        <p className="t3-hint">{c3.KNOW_THE_LOOK}</p>
      </div>
    )
  }
  const tone = contact.exposed === 0 ? 't3-ok' : contact.favor === 'unlikely' ? 't3-dimmed' : 't3-bad'
  return (
    <div className="t3-card" key={`c-${contact.id}`} data-t3-card="contact" data-known="true" data-favor={contact.favor}>
      <div className="t3-head">
        <SignatureGlyph id={contact.id} size={48} className="t3-glyph-big" />
        <div className="t3-grow">
          <p className="t3-eyebrow">
            <span className={tone}>{contact.exposed === 0 ? 'SHIELDED' : c3.FAVOR_TAG[contact.favor]}</span> · {c3.trackOf(track, tracks)} · {sign}
            {filed ? '' : ' · NEW'}
          </p>
          <h2 className="t3-title">
            {shortName(def)} {!contact.debris && <i className="t3-bad">{dots(contact.strength)}</i>}
          </h2>
        </div>
        <Close onClose={onClose} />
      </div>
      <p className="t3-hook">{copy.HOOK[def.id] ?? def.name}.</p>
      <p className="t3-fav" data-t3-favor>
        {contact.debris ? c3.DEBRIS_NOTE : contact.favor === 'unlikely' ? (contact.exposed === 0 ? c3.FAVOR_STOPPED : c3.FAVOR.unlikely) : `${c3.FAVOR[contact.favor]} ${c3.aboutLoss(contact.loss)}`}
      </p>
      {answers.map((a) => {
        const lockedBy = !a.ordered && !a.owned && locked ? ` · ${c3.replaces(locked)}` : ''
        const line = a.owned ? c3.OWNED : a.ordered ? `${c3.PLACED} · tap to take it back` : `${verbWord(a.verb)} it${a.then ? `, ${a.then}` : ', every night'}${lockedBy}${a.risky ? `. ${c3.RISKY}` : ''}`
        return (
          <button
            key={a.id}
            type="button"
            data-t3-order={a.id}
            data-risky={a.risky || undefined}
            aria-pressed={a.ordered}
            disabled={a.owned || (a.blocked === 'budget' && !a.ordered)}
            aria-label={`${a.name}. ${a.cost} CR. ${line}.`}
            className={`t3-choice t3-defense${a.ordered ? ' is-on' : ''}`}
            onClick={() => onPlace(a.id)}
          >
            <span className="t3-choice-top">
              <b>{PIECE[a.id]}</b>
              <span>{a.owned ? '' : `${a.cost} CR`}</span>
            </span>
            <span className={`t3-choice-sub ${a.then || a.risky ? 't3-warn' : 't3-ok'}`}>{a.blocked === 'budget' && !a.ordered ? 'Not enough budget tonight' : line}</span>
          </button>
        )
      })}
    </div>
  )
}

// A PIECE IN HAND: the defense by its formal name, what it answers
// tonight, and where it can go.
export function PieceCard({ piece, targets, locked, upkeep, onPlace, onRemove, onClose }: { piece: KitPiece; targets: { id: string; sign: string }[]; locked: string | null; upkeep: number; onPlace: (assetId: string) => void; onRemove: () => void; onClose: () => void }) {
  const { cm } = piece
  return (
    <div className="t3-card" key={`p-${cm.id}`} data-t3-card="piece">
      <div className="t3-head">
        <MechanismGlyph defense={cm.id} size={44} />
        <div className="t3-grow">
          <p className="t3-eyebrow">
            {piece.blocked === 'owned' ? c3.OWNED : `${cm.cost} CR · ${c3.upkeepNote(upkeep)}`}
          </p>
          <h2 className="t3-title">{cm.name}</h2>
        </div>
        <Close onClose={onClose} />
      </div>
      <p className="t3-hook">{cm.blurb}</p>
      <p className="t3-fav">
        {piece.answers.length
          ? `${c3.answersTonight}: ${piece.answers.map((a) => `${verbWord(a.verb).toLowerCase()} ${shortName(a.contact.def)}`).join(', ')}.`
          : c3.nothingKnown}
      </p>
      {piece.blocked === 'budget' && <p className="t3-note">Not enough budget tonight.</p>}
      {piece.risky && !piece.ordered && <p className="t3-note">{c3.RISKY}.</p>}
      {piece.ordered ? (
        <button type="button" data-t3-remove className="t3-btn" onClick={onRemove}>
          {c3.TAKE_BACK}
        </button>
      ) : piece.blocked ? null : (
        <>
          <div className="t3-row t3-wrap">
            {targets.slice(0, 4).map((t, i) => (
              <button key={t.id} type="button" data-t3-place={t.id} className={`t3-btn${i === 0 ? ' t3-primary' : ''}`} onClick={() => onPlace(t.id)}>
                {c3.placeOn(t.sign)}
              </button>
            ))}
          </div>
          <p className="t3-hint">
            {c3.PLACE_NOTE} {c3.dragHint}
            {locked ? ` ${c3.replaces(locked)}` : ''}
          </p>
        </>
      )}
    </div>
  )
}

export function AssetCard({ asset, sign, contacts, conditions, modules, onContact, onClose }: { asset: Asset; sign: string; contacts: Contact[]; conditions: { name: string; left: number }[]; modules: string[]; onContact: (id: string) => void; onClose: () => void }) {
  return (
    <div className="t3-card" key={`a-${asset.id}`} data-t3-card="asset">
      <div className="t3-head">
        <div className="t3-grow">
          <p className="t3-eyebrow">{kindLabels[asset.kind].toUpperCase()}</p>
          <h2 className="t3-title">
            {sign} <small>{asset.integrity > 0 ? `integrity ${asset.integrity}%` : 'lost'}</small>
          </h2>
        </div>
        <Close onClose={onClose} />
      </div>
      {conditions.map((c) => (
        <p key={c.name} className="t3-fav t3-warn">
          {nightly(copy.conditionTag(c.name, c.left))}. {c3.CONDITION_NOTE}
        </p>
      ))}
      {modules.length > 0 && <p className="t3-fav t3-ok">{`${c3.OWNED}: ${modules.join(', ')}.`}</p>}
      {contacts.length === 0 && <p className="t3-quiet">No signature over it tonight.</p>}
      {contacts.map((c) => (
        <button key={c.id} type="button" className="t3-move" data-t3-move={c.id} onClick={() => onContact(c.id)}>
          <SignatureGlyph id={c.id} size={30} named={c.known} />
          <span>
            <b>{c.known ? shortName(c.def) : c3.UNKNOWN_LEAD}</b> {c.known && <i>{dots(c.strength)}</i>}
            <small>{c.known ? (c.exposed === 0 ? 'your shield stops it' : c3.FAVOR_TAG[c.favor].toLowerCase()) : 'tap to scan it'}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

export function FleetCard({ fleet, signs, onToggle, onClose }: { fleet: FleetPiece[]; signs: Partial<Record<AssetKind, string>>; onToggle: (kind: AssetKind) => void; onClose: () => void }) {
  return (
    <div className="t3-card" key="fleet" data-t3-card="fleet">
      <div className="t3-head">
        <div className="t3-grow">
          <p className="t3-eyebrow">{c3.FLEET}</p>
          <p className="t3-hook">{c3.fleetLead}</p>
        </div>
        <Close onClose={onClose} />
      </div>
      <div className="t3-grid2">
        {fleet.map((f) => (
          <button key={f.kind} type="button" data-t3-asset-order={f.kind} aria-pressed={f.ordered} disabled={!f.fits} className={`t3-choice t3-defense${f.ordered ? ' is-on' : ''}`} onClick={() => onToggle(f.kind)}>
            <span className="t3-choice-top">
              <b>{kindLabels[f.kind]}</b>
              <span>{f.price} CR</span>
            </span>
            <span className={`t3-choice-sub ${f.risky ? 't3-warn' : 't3-ok'}`}>
              {f.ordered ? `${c3.ORDERED} · ${signs[f.kind] ?? ''} ${c3.arrivesIn(f.eta)}` : f.fits ? `${c3.coverageOf(COVERAGE_PER_KIND[f.kind])} · ${c3.arrivesIn(f.eta)}${f.risky ? `. ${c3.RISKY}` : ''}` : 'Not enough budget tonight'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ the night

// THE RESPONSE, BESIDE ITS TARGET. Each answer is a piece: drag it onto
// the target, make its gesture on the world, or tap it.
export function ChoiceCard({
  step,
  choices,
  sign,
  credits,
  chain,
  more,
  first,
  onRespond,
  startDrag,
}: {
  step: NightStep
  choices: Choice[]
  sign: string
  credits: number
  chain: boolean
  // The moves still to come tonight after this one.
  more: number
  first: RefObject<HTMLButtonElement | null>
  onRespond: (id: string | null) => void
  startDrag: StartDrag
}) {
  const { ev, def } = step
  const strength = ev.baseSeverity + ev.chainBonus
  const exposed = exposedOf(ev)
  const { held } = defensesFor(def, step.before.counters, step.before.scenario)
  return (
    <div className="t3-card" key={`choose-${step.index}`} data-t3-card="respond">
      <div className="t3-head">
        <SignatureGlyph id={def.id} size={44} className="t3-glyph-big" />
        <div className="t3-grow">
          <p className="t3-eyebrow t3-bad">
            INCOMING · {sign} <span className="t3-right">1 ANSWER A NIGHT</span>
          </p>
          <h2 className="t3-title">
            {shortName(def)} <i className="t3-bad">{dots(strength)}</i>
          </h2>
        </div>
      </div>
      <p className="t3-hook">
        {chain ? `${copy.CHAIN_ADDS}. ` : ''}
        {copy.exposedLine(strength, exposed, held ? `Your ${PIECE[held.id]}` : undefined)}
      </p>
      <div role="group" aria-label={copy.YOUR_RESPONSE} className="t3-choices">
        {choices.map((c, k) => {
          const label = c.id ? (RESPONSE_TEXT[def.id]?.[c.id] ?? c.id) : copy.RIDE_IT_OUT
          const effect = c.fits ? copy.effectLine(c.effect, c.score, c.repair) : copy.EFFECT_WORD[c.effect]
          const why = c.fits ? '' : c.why === 'used' ? copy.ALREADY_ANSWERED : c3.needs(c.need, ev.room ?? 0)
          const cost = c.id ? copy.crFace(c.cost) : copy.FREE
          const how = c.gesture && c.fits ? ` ${c3.GESTURE[c.gesture]}, or tap.` : ''
          return (
            <button
              key={c.id ?? 'ride'}
              ref={k === 0 ? first : undefined}
              type="button"
              data-t3-response={c.id ?? 'ride'}
              data-effect={c.effect}
              data-gesture={c.gesture ?? undefined}
              disabled={!c.fits}
              aria-label={`${label}. ${cost}. ${why || effect}.${how}`}
              className={`t3-choice t3-${c.effect}`}
              onPointerDown={c.id && c.fits ? (e) => startDrag(e, c.id as string, label) : undefined}
              onClick={() => onRespond(c.id)}
            >
              <span className="t3-choice-top">
                <b>
                  <GestureMark gesture={c.fits ? c.gesture : null} />
                  {label}
                </b>
                <span>{cost}</span>
              </span>
              <span className="t3-choice-sub">
                {why || effect}
                {c.gesture && c.fits ? <em> · {c3.GESTURE_TAG[c.gesture]}</em> : null}
              </span>
            </button>
          )
        })}
      </div>
      <p className="t3-foot" data-t3-response-budget>
        {c3.freeForAnswer(ev.room ?? 0, credits)} {c3.moreToCome(more)}
      </p>
    </div>
  )
}

// THE DEBRIS CALL, in the world: burn the satellite off the crossing
// orbit, or hold and take the odds.
export function CallCard({ turn, terms, first, onCall }: { turn: number; terms: ReturnType<typeof callTerms>; first: RefObject<HTMLButtonElement | null>; onCall: (choice: DebrisChoice) => void }) {
  return (
    <div className="t3-card" key="call" data-t3-card="call">
      <div className="t3-head">
        <SignatureGlyph id="debris-conjunction" size={44} className="t3-glyph-big" />
        <div className="t3-grow">
          <p className="t3-eyebrow t3-warn">{copy.callHeader(turn).replace('TURN', 'NIGHT')}</p>
          <h2 className="t3-title">Debris on a crossing orbit</h2>
        </div>
      </div>
      <p className="t3-hook">{joined(copy.oddsLine(terms.ssa, terms.chance))}</p>
      <div className="t3-choices" role="group" aria-label={copy.CHOOSE}>
        <button ref={first} type="button" data-t3-call="burn" className="t3-choice t3-block" onClick={() => onCall('burn')}>
          <span className="t3-choice-top">
            <b>{copy.BURN}</b>
            <span>{terms.fuel > 0 ? copy.crFace(terms.fuel) : copy.FREE}</span>
          </span>
          <span className="t3-choice-sub">{copy.burnLine(terms.ssa, terms.chance, terms.sat, terms.bonus)}</span>
        </button>
        <button type="button" data-t3-call="hold" className="t3-choice t3-ride" onClick={() => onCall('hold')}>
          <span className="t3-choice-top">
            <b>{copy.HOLD}</b>
            <span>{copy.FREE}</span>
          </span>
          <span className="t3-choice-sub">{copy.holdLine(terms.ssa, terms.chance, terms.sat, terms.review)}</span>
        </button>
      </div>
      <p className="t3-foot">{c3.BURN_DRAG}</p>
    </div>
  )
}

// THE RESULT, IN PLACE: what the strike did, what the player did about it,
// why a defense held, what would have helped, and the Dossier card.
export function ResultCard({
  step,
  sign,
  signs,
  fresh,
  filed,
  open,
  onOpen,
  last,
  first,
  could,
  assist,
  onContinue,
}: {
  step: NightStep
  sign: string
  signs: Map<string, string>
  // The tap was granted, not made: its line says ASSIST.
  assist: boolean
  fresh: boolean
  filed: { n: number; total: number } | null
  open: boolean
  onOpen: () => void
  last: boolean
  first: RefObject<HTMLButtonElement | null>
  could: Choice | undefined
  onContinue: (collect: boolean) => void
}) {
  const { ev, def } = step
  const next = last ? c3.SEE_DAWN : c3.NEXT_STRIKE
  if (step.kind === 'opportunity') {
    const turns = def.benefit?.briefTurns
    const lines = opportunityLines(step, signs).map((l) => (turns && l === copy.briefFreeLine(turns) ? c3.alliedLine(Math.min(turns, step.before.scenario.totalTurns - step.before.turn)) : nightly(l)))
    return (
      <div className="t3-card" key={`res-${step.index}`} data-t3-card="windfall">
        <p className="t3-eyebrow t3-ok">{c3.GOOD_NEWS}</p>
        <h2 className="t3-title">{shortName(def)}</h2>
        {lines.map((l) => (
          <p key={l} className="t3-hook">
            {l}
          </p>
        ))}
        <button ref={first} type="button" data-t3-continue className="t3-btn t3-primary" onClick={() => onContinue(false)}>
          {last ? c3.SEE_DAWN : copy.CONTINUE}
        </button>
      </div>
    )
  }
  const scenario = step.after.scenario
  const dossierFold = (
    <DossierFold step={step} fresh={fresh} open={open} onOpen={onOpen} />
  )
  const way = filed ? (
    <p className="t3-stamp" role="status" data-t3-filed>
      {copy.filedCount(filed.n, filed.total)}
    </p>
  ) : fresh ? (
    <button ref={first} type="button" data-t3-file className="t3-btn t3-primary" onClick={() => onContinue(true)}>
      {copy.FILE_TO_DOSSIER}
    </button>
  ) : (
    <button ref={first} type="button" data-t3-continue className="t3-btn t3-primary" onClick={() => onContinue(false)}>
      {next}
    </button>
  )
  if (step.kind === 'debris' && ev.debris) {
    const d = ev.debris
    const ssa = scenario.countermeasures.find((c) => c.id === 'ssaManeuver')
    const tone = d.lost ? 'hit' : 'blocked'
    return (
      <div className={`t3-card t3-result-${tone}`} key={`res-${step.index}`} data-t3-card="result" data-t3-verdict={d.lost ? 'lost' : 'safe'}>
        <div className="t3-verdict">
          <b className={`t3-${tone}`}>{copy.debrisHead(d.lost, d.choice)}</b>
          <span>{copy.debrisTitle(d.lost, d.choice)}</span>
          <span className="t3-right">{copy.youChose(d.choice)}</span>
        </div>
        <p className="t3-helped">{nightly(copy.debrisText({ choice: d.choice, lost: d.lost, sat: sign || undefined }))}</p>
        <p className="t3-tagsline">
          {d.fuel > 0 && <span>{copy.fuelNow(d.fuel)}</span>}
          {ev.repairCost > 0 && <span className="t3-warn">{copy.reviewQueued(ev.repairCost)}</span>}
        </p>
        {!d.ssa && ssa && d.assetId && <p className="t3-helped">{joined(copy.debrisHelp(d.lost, ssa.name, ssa.cost))}</p>}
        {dossierFold}
        {way}
      </div>
    )
  }
  const verdict = verdictOf(ev)
  const delta = tenth(step.scoreAfter - step.scoreBefore)
  const { held, missing, partner } = defensesFor(def, step.after.counters, scenario)
  const officer = copy.officerFor(step, sign || undefined)
  // The piece by the name on its piece; the formal name is on its card.
  const piece = missing ? PIECE[missing.id] : ''
  const helped = missing ? joined(ev.response ? copy.lastingAnswer(piece, missing.cost) : held ? copy.finishedIt(piece, missing.cost) : copy.wouldHaveHelped(piece, missing.cost)) : ''
  const stops = missing && !held ? ` It ${stopVerb(missing.id, def) === 'stops' ? 'stops' : 'blunts'} ${shortName(def)} every night.` : ''
  const byDefense = verdict === 'blocked' && blockedBy(ev) === 'defense' && held
  const tap = tapLine(ev, assist)
  const used = ev.room !== undefined && !ev.response && (ev.answered ?? 0) > 0
  return (
    <div className={`t3-card t3-result-${verdict}`} key={`res-${step.index}`} data-t3-card="result" data-t3-verdict={verdict}>
      <div className="t3-verdict">
        <b className={`t3-${verdict}`}>{VERDICT_WORD[verdict]}</b>
        <span>
          {shortName(def)} on {sign || 'the fleet'}
        </span>
        <span className="t3-right" data-t3-delta>
          {copy.scoreChange(delta)}
        </span>
      </div>
      <p className="t3-tagsline">
        {ev.response ? (
          <span data-t3-took={ev.response.id}>{copy.youDid(RESPONSE_TEXT[def.id]?.[ev.response.id] ?? ev.response.id, ev.response.cost)}</span>
        ) : ev.room !== undefined ? (
          <span data-t3-took={used ? 'used' : 'ride'}>{used ? c3.ANSWER_USED : copy.RODE_OUT}</span>
        ) : null}
        {tap && (
          <span className="t3-ok" data-t3-tapline>
            {tap}
          </span>
        )}
        {ev.repairCost > 0 && <span>{copy.repairTag(ev.repairCost, ev.integrityAfter !== undefined)}</span>}
        {ev.condition && <span className="t3-warn">{nightly(copy.conditionTag(ev.condition.name, Math.max(0, ev.condition.turns - 1)))}</span>}
        {verdict === 'blocked' && step.streak >= 2 && <span className="t3-ok">{copy.streakLine(step.streak)}</span>}
      </p>
      {/* What happened, when it got through: the watch officer's own report. */}
      {verdict !== 'blocked' && officer && !officer.held && (
        <div className="t3-why t3-what" data-t3-what>
          <SignatureGlyph id={def.id} size={44} />
          <p>
            <span>{c3.WHAT_HAPPENED}</span>
            {officer.line}
          </p>
        </div>
      )}
      {/* Why it held: the defense's own report, with the mark of how. */}
      {byDefense && held && officer?.held && (
        <div className="t3-why" data-t3-why>
          <MechanismGlyph defense={held.id} />
          <p>
            <span>{c3.WHY_HELD}</span>
            {officer.line}
          </p>
        </div>
      )}
      <p className="t3-helped" data-t3-helped>
        {byDefense && held
          ? joined(partner ? copy.canNowSayWith(held.name, shortName(def), partner.name) : copy.canNowSay(held.name, shortName(def)))
          : `${ev.response ? `${copy.TONIGHT_ONLY} ` : ''}${helped}${stops}${could && could.id ? ` ${joined(copy.couldHave(RESPONSE_TEXT[def.id]?.[could.id] ?? could.id, could.cost))}` : ''}`}
      </p>
      {dossierFold}
      {way}
    </div>
  )
}

// The Dossier card's headline on a result, with the whole card one tap in.
function DossierFold({ step, fresh, open, onOpen }: { step: NightStep; fresh: boolean; open: boolean; onOpen: () => void }) {
  const { def } = step
  const scenario = step.after.scenario
  const ref = def.techniqueRefs[0]
  const source = def.learnMoreCards[0]?.sources[0]
  const stopped = stoppedByLine(def, scenario)
  return (
    <div className={`t3-dossier${fresh ? ' is-fresh' : ''}`} data-t3-dossier={def.id}>
      <button type="button" className="t3-dossier-head" aria-expanded={open} onClick={onOpen}>
        <span className="t3-eyebrow">
          {fresh ? copy.NEW_DOSSIER : copy.IN_DOSSIER}
          {ref ? ` · ${techniqueLabel(ref).split(' ')[0]}` : ''}
          <span className="t3-right">{open ? 'CLOSE' : copy.READ_CARD}</span>
        </span>
        <b>{copy.HOOK[def.id] ?? def.name}</b>
      </button>
      {open && (
        <div className="t3-dossier-body">
          <p>{def.blurb}</p>
          <dl>
            {ref && (
              <>
                <dt>{copy.TECHNIQUE}</dt>
                <dd>
                  {techniqueLabel(ref)} {ref.name}
                </dd>
              </>
            )}
            <dt>{stopped.label}</dt>
            <dd>{stopped.text}</dd>
            {source && (
              <>
                <dt>{copy.SOURCE}</dt>
                <dd>{source.title}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}

// A strike on its way in, or landing: its name, its look, and the tap.
export function StrikeBanner({ step, sign, landing, tapOn, assist, chain, used, onTap }: { step: NightStep; sign: string; landing: boolean; tapOn: boolean; assist: boolean; chain: boolean; used: boolean; onTap: () => void }) {
  return (
    <div className={`t3-card t3-banner${chain ? ' t3-chain' : ''}`} key={`in-${step.index}`} data-t3-card="strike">
      <p className="t3-eyebrow t3-bad">{chain ? c3.CHAIN : 'INCOMING'}</p>
      <p className="t3-lead">
        <SignatureGlyph id={step.def.id} size={28} /> <b>{shortName(step.def)}</b> on {sign || 'the fleet'}
      </p>
      {chain && !landing && <p className="t3-hint">{c3.CHAIN_LINE}</p>}
      {used && <p className="t3-hint t3-warn">{copy.ALREADY_ANSWERED}.</p>}
      {landing &&
        (tapOn ? (
          <button type="button" data-t3-tap className="t3-tap" aria-label={`${c3.TAP}. ${c3.TAP_HINT}.`} onPointerDown={onTap} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onTap()}>
            <b>{c3.TAP}</b>
            <span>{c3.TAP_HINT}</span>
          </button>
        ) : assist ? (
          <p className="t3-hint t3-ok" data-t3-assist>
            {c3.ASSIST_ON}
          </p>
        ) : null)}
    </div>
  )
}

// -------------------------------------------------------------- the dawn

// THE DAWN: the turn's close. The score's change large, where it leaves
// the run against the win line, the streak, the budget in one line, and
// what to fix.
export function DawnCard({
  before,
  night,
  after,
  signs,
  first,
  onNext,
}: {
  before: GameState
  night: Night
  after: GameState
  signs: Map<string, string>
  first: RefObject<HTMLButtonElement | null>
  onNext: () => void
}): ReactNode {
  const rec = night.record
  const from = maiScore(before)
  const to = rec.maiScore
  const line = before.scenario.winThreshold
  const over = after.status !== 'playing'
  const threats = night.steps.filter((s) => s.kind === 'threat')
  const stopped = threats.filter((s) => s.ev.effectiveSeverity === 0).length
  const halved = threats.filter((s) => s.ev.response?.effect === 'halve').length
  const l = rec.ledger
  const worst = threats.filter((s) => s.ev.effectiveSeverity > 0).sort((a, b) => a.scoreAfter - a.scoreBefore - (b.scoreAfter - b.scoreBefore))[0]
  const missing = worst ? defensesFor(worst.def, after.counters, after.scenario).missing : undefined
  const fix = !worst ? copy.NOTHING_THROUGH : missing ? joined(copy.fixDefense(PIECE[missing.id], missing.cost, shortName(worst.def), stopVerb(missing.id, worst.def) === 'stops' ? 'stops' : 'blunts')) : copy.fixRespond(shortName(worst.def))
  const parts = [
    l.ordered ? `Orders -${l.ordered}` : '',
    l.fuel ? `Fuel -${l.fuel}` : '',
    l.responses ? `Responses -${l.responses}` : '',
    l.refunds ? `Clean blocks +${l.refunds}` : '',
    l.windfall ? `Windfall +${l.windfall}` : '',
    l.repairs ? `Repairs -${l.repairs}` : '',
    l.upkeep ? `Upkeep -${l.upkeep}` : '',
    l.funding ? `Funding +${l.funding}` : '',
    l.coverageBonus ? `Coverage bonus +${l.coverageBonus}` : '',
  ].filter(Boolean)
  const arrivals = l.arrivals.map((id) => signs.get(id) ?? id)
  const ending = over ? (after.status === 'won' ? copy.ENDING.won : copy.ENDING[after.lossReason ?? 'belowThreshold']) : null
  return (
    <div className="t3-card t3-dawn" key={`dawn-${rec.turn}`} data-t3-card="dawn">
      <p className={`t3-eyebrow ${threats.length && stopped === threats.length ? 't3-ok' : 't3-warn'}`}>
        {c3.dawnOf(rec.turn)} · {threats.length === 0 ? 'A QUIET NIGHT' : stopped === threats.length ? c3.CLEAN : c3.stoppedOf(stopped, threats.length, halved)}
      </p>
      {ending && (
        <p className={`t3-ending ${after.status === 'won' ? 't3-ok' : 't3-bad'}`} data-t3-ending>
          <b>{ending.head}</b> {nightly(l.insolvent ? copy.INSOLVENT_LINE : ending.line(after.status === 'won' ? rec.turn : after.lossReason === 'maiCollapse' ? before.scenario.collapseThreshold : line))}
        </p>
      )}
      <p className="t3-ledger" data-t3-scoreline>
        Score {from.toFixed(1)} → {to.toFixed(1)}
        <small>
          {Math.abs(to - from) < 0.05 ? 'Held through the night.' : `${signed(tenth(to - from))} tonight.`} {c3.toLine(to, line)}.
        </small>
        {/* What made the change, so a night's net is never a number no line explains. */}
        <small data-t3-scoreparts>{copy.scoreParts(scoreRows(night).filter((r) => r.key !== 'from' && r.key !== 'to'))}</small>
      </p>
      {!over && (
        <p className="t3-helped">
          {worst ? <span className="t3-warn">{copy.FIX_LABEL} </span> : null}
          {fix}
        </p>
      )}
      <p className="t3-ledger" data-t3-ledger>
        Budget {l.start} CR → {l.after} CR<small>{parts.join(' · ')}</small>
      </p>
      {(arrivals.length > 0 || (after.status === 'playing' && after.conditions.length > 0)) && (
        <p className="t3-tagsline">
          {arrivals.length > 0 && <span className="t3-ok">{c3.arrived(arrivals.join(', '))}</span>}
          {(after.status === 'playing' ? after.conditions : []).map((c) => (
            <span key={c.instanceId} className="t3-warn">
              {nightly(copy.conditionTag(c.name, c.remainingTurns))}
            </span>
          ))}
        </p>
      )}
      <button ref={first} type="button" data-t3-next className="t3-btn t3-primary" onClick={onNext}>
        {over ? c3.TO_DEBRIEF : c3.nextNight(after.turn)}
      </button>
    </div>
  )
}
