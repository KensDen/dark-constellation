// THE 3D GAME'S CARDS (v2.0 R1): what stands in the dock beside the world.
// Before the night: the signature in hand, the piece in hand, the asset,
// the fleet. In the night: the answers, the debris call, the result with
// why it held and the Dossier card. At dawn: the turn's close. Each one
// only shows what Game3D hands it; the engine's figures arrive computed.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { RESPONSE_TEXT } from '../../content/responseText'
import { answersLeft, answersOf } from '../../engine/rules'
import { maiScore } from '../../engine/scoring'
import type { Asset, AssetKind, CountermeasureId, DebrisChoice, GameState, HoldCall, HoldTemplate, ResolvedHold } from '../../engine/types'
import { COVERAGE_PER_KIND } from '../../engine/scoring'
import { callSigns } from '../board/board'
import { shortName, stopVerb, stoppedByLine } from '../board/boardModel'
import { kindLabels, techniqueLabel } from '../labels'
import { opportunityLines, scoreRows, type callTerms } from '../night/closeModel'
import * as copy from '../night/nightCopy'
import { defensesFor, exposedOf, type Night, type NightStep } from '../night/nightModel'
import * as c3 from './copy3d'
import { PIECE, blockedBy, dodgeOf, fixNext, tapLine, verdictOf, type Choice, type Contact, type FleetPiece, type KitPiece, type Stakes, type Verdict } from './gameModel'
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
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  </button>
)

type StartDrag = (e: ReactPointerEvent<HTMLElement>, id: string, label: string) => void

// ---------------------------------------------------- before the night

// BEFORE THE NIGHT, AT REST: the watch officer's line, tonight's
// signatures as a row of buttons under the thumb (each one also stands
// over its asset in the world), and what is at stake.
export function PlanCard({
  eyebrow,
  summary,
  intro,
  note,
  risk,
  contacts,
  signs,
  stakes,
  scanLeft,
  scanPulses,
  answers,
  answersOf,
  onPick,
  lens,
}: {
  eyebrow: string
  // Tonight's orders so far, in a line.
  summary: string
  intro: string
  note: string
  // BEGIN was pressed on a night that could break the budget: said whole.
  risk?: string
  contacts: Contact[]
  signs: Map<string, string>
  stakes: Stakes
  scanLeft: number
  scanPulses: number
  // The answers left for the operation, and how many it began with.
  answers: number
  answersOf: number
  onPick: (id: string) => void
  lens: ReactNode
}) {
  const [whole, setWhole] = useState(false)
  return (
    <div className="t3-card t3-plan" data-t3-card="plan" data-t3-chunk={CHUNK_MARK}>
      <p className="t3-eyebrow">
        {eyebrow}
        <span className="t3-right">{summary}</span>
      </p>
      {/* A line cut short to keep the card's height opens at a tap: cut
          lines that could not be opened were the phone reviewer's second
          complaint. */}
      <p className={`${risk ? 't3-note t3-risknote' : note ? 't3-note' : 't3-lead'}${whole ? ' is-whole' : ''}`} role={risk ? 'alert' : undefined} data-t3-line onClick={() => setWhole((w) => !w)}>
        {risk || note || intro}
      </p>
      <div className="t3-sigs" role="group" aria-label={c3.signaturesOver(contacts.length)} data-t3-sigs>
        {contacts.map((c, i) => {
          const sign = signs.get(c.targetId ?? '') ?? ''
          return (
            <button
              key={c.id}
              type="button"
              data-t3-sig={c.id}
              data-first={i > 0 && contacts[i - 1].slot !== c.slot ? '' : undefined}
              data-known={c.known}
              aria-label={c.known ? `${shortName(c.def)}, strength ${c.strength}, over ${sign}. ${c.exposed === 0 ? 'Stopped' : c3.FAVOR_TAG[c.favor]}.` : `Unidentified signature over ${sign}. Tap to scan it.`}
              className={`t3-sig${c.known ? ' is-known' : ''}${c.known && c.exposed === 0 ? ' is-held' : ''} t3-fav-${c.favor}`}
              onClick={() => onPick(c.id)}
            >
              <SignatureGlyph id={c.id} size={30} named={c.known} />
              <span>
                <b>{c.known ? (c3.TAG[c.id] ?? shortName(c.def)) : '?'}</b>
                <small>{sign}</small>
              </span>
            </button>
          )
        })}
      </div>
      <div className="t3-stakes" data-t3-stakes>
        <p>
          <span>{c3.AT_STAKE}</span>
          <b className={stakes.atStake < -0.05 ? 't3-bad' : 't3-ok'}>{c3.upTo(stakes.atStake)}</b>
        </p>
        {/* Red only when the mark is up; short with no mark is possible,
            not likely, and reads amber (v2.0 R5). */}
        <p title={c3.worstNote(stakes.worst, stakes.risky)} data-t3-worst-state={stakes.risky ? 'risky' : stakes.worst < 0 ? 'short' : 'clear'}>
          <span>{c3.WORST}</span>
          <b className={stakes.risky ? 't3-bad' : stakes.worst < 0 ? 't3-warn' : ''} aria-label={c3.worstFace(stakes.worst)}>
            {c3.worstTile(stakes.worst)}
          </b>
          <span className="t3-sr">{c3.worstNote(stakes.worst, stakes.risky)}</span>
        </p>
        {answersOf > 0 && (
          <p data-t3-answers={answers} aria-label={c3.answersLeft(answers, answersOf)}>
            <span>{c3.ANSWERS}</span>
            <b className={answers === 0 ? 't3-bad' : 't3-ok'} aria-hidden="true">
              {'●'.repeat(answers)}
              {'○'.repeat(Math.max(0, answersOf - answers))}
            </b>
          </p>
        )}
        {lens}
      </div>
      <span className="t3-sr" data-t3-scan-state>
        {c3.pulsesLeft(scanLeft, scanPulses)}
      </span>
    </div>
  )
}

// THE TRAY: the fleet's door, then the defenses as pieces to pick up, in
// the catalog's order every night, with the ones that answer what has been
// identified lit.
//
// ON A PHONE IT SHOWS WHOLE PIECES (v2.0 R3). Through R2 the row scrolled
// freely beside BEGIN, so the third piece always stood half under the
// button, and a fade over the cut did not make it read as anything but a
// cut (the R2 reviewer). Now 2 pieces fill the row and it moves a page at
// a time: by a swipe, which settles on a piece's edge, or by the button at
// its end, which says which page of how many it is on and turns back at
// the last. It never moves by itself: a first build brought the piece lit
// for an identified signature into view, and the round's phone reviewer
// read that as the row reordering and lost the fleet's door behind it.
// Lit, not moved, so the order is the one to learn.
export function Tray({ kit, fleetOrdered, selected, reduced, onPick, onFleet, startDrag }: { kit: KitPiece[]; fleetOrdered: number; selected: CountermeasureId | 'fleet' | null; reduced: boolean; onPick: (id: CountermeasureId) => void; onFleet: () => void; startDrag: StartDrag }) {
  const box = useRef<HTMLDivElement | null>(null)
  // The page in view and how many there are: 2 pieces a page on a phone.
  const [at, setAt] = useState({ page: 1, of: 1 })
  const atEnd = at.page >= at.of
  const isHot = (p: KitPiece) => !p.blocked && p.answers.some((a) => a.contact.favor !== 'unlikely' && a.contact.exposed > 0)
  const to = (left: number) => box.current?.scrollTo?.({ left, behavior: reduced ? 'auto' : 'smooth' })
  const measure = (b: HTMLElement) => {
    const of = Math.max(1, Math.round(b.scrollWidth / Math.max(1, b.clientWidth)))
    const page = b.scrollLeft + b.clientWidth >= b.scrollWidth - 6 ? of : Math.min(of, Math.round(b.scrollLeft / Math.max(1, b.clientWidth)) + 1)
    setAt((was) => (was.page === page && was.of === of ? was : { page, of }))
  }
  useEffect(() => {
    if (box.current) measure(box.current)
  }, [kit.length])
  const page = () => {
    const b = box.current
    if (b) to(atEnd ? 0 : b.scrollLeft + b.clientWidth)
  }
  return (
    <>
    <div ref={box} className="t3-tray" role="group" aria-label={`${c3.KIT}. ${c3.ONE_A_NIGHT}.`} data-t3-tray onScroll={(e) => measure(e.currentTarget)}>
      <button type="button" data-t3-fleet aria-pressed={selected === 'fleet'} aria-label={`${c3.FLEET}. Order new assets.${fleetOrdered ? ` ${fleetOrdered} ordered.` : ''}`} className={`t3-piece t3-piece-fleet${selected === 'fleet' ? ' is-on' : ''}${fleetOrdered ? ' is-ordered' : ''}`} onClick={onFleet}>
        <b>{c3.FLEET}</b>
        <span>{fleetOrdered ? `${fleetOrdered} ${c3.ORDERED}` : '+ assets'}</span>
      </button>
      {kit.map((p) => {
        const hot = isHot(p)
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
            className={`t3-piece${p.ordered ? ' is-ordered' : ''}${p.blocked ? ` is-${p.blocked}` : ''}${hot ? ' is-hot' : ''}${p.risky && !p.ordered ? ' is-risky' : ''}${selected === p.cm.id ? ' is-on' : ''}`}
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
    <button type="button" className="t3-traymore" data-t3-tray-more={atEnd ? 'back' : 'more'} aria-label={`${atEnd ? c3.TRAY_BACK : c3.TRAY_MORE}. ${c3.trayPage(at.page, at.of)}.`} onClick={page}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d={atEnd ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span aria-hidden="true">
        {at.page}/{at.of}
      </span>
    </button>
    </>
  )
}

// A SIGNATURE IN HAND. Unidentified: its look, the scan, and the name on
// sight (v2.0 R3: 4 names, no pulse spent, and the first wrong name ends
// naming for the night). Identified:
// what it is, what COLDVEIL does with it, what it would take from the
// score, and the pieces that answer it.
export interface SightView {
  // The names on offer, when the player has asked to name it.
  options: { id: string; name: string }[] | null
  // A name was wrong tonight: naming is over until the next night.
  missed: boolean
  onOpen: () => void
  onName: (id: string) => void
}
// The mark the bundle budget finds this chunk by: the cards, the model and
// the words the game and its rooms share (tests/bundle-budget.json).
const CHUNK_MARK = 'dc-3d-cards-chunk'

export interface AnswerView {
  id: CountermeasureId
  name: string
  cost: number
  verb: 'stops' | 'blunts' | 'answers'
  owned: boolean
  ordered: boolean
  blocked: 'owned' | 'budget' | null
  risky: boolean
  odds: number
  soon: boolean
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
  scanning,
  sight,
  onScan,
  onPlace,
  onStep,
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
  // The scan is on its way: the button says so at once.
  scanning: boolean
  // The name on sight, where it is offered.
  sight: SightView | null
  onScan: () => void
  onPlace: (id: CountermeasureId) => void
  // To the signature before or after this one, under the thumb.
  onStep: (by: 1 | -1) => void
  onClose: () => void
}) {
  const { def } = contact
  void track
  const step = (
    <span className="t3-step">
      <button type="button" className="t3-round t3-small" aria-label="Previous signature" data-t3-step="-1" onClick={() => onStep(-1)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" className="t3-round t3-small" aria-label="Next signature" data-t3-step="1" onClick={() => onStep(1)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </span>
  )
  if (!contact.known) {
    return (
      <div className={`t3-card${sight?.options ? ' is-naming' : ' is-unknown'}`} key={`c-${contact.id}`} data-t3-card="contact" data-known="false">
        <div className="t3-head">
          {/* Smaller beside the 4 names, so they and their terms fit the card's one height. */}
          <SignatureGlyph id={contact.id} size={sight?.options ? 40 : 56} named={false} className="t3-glyph-big" />
          <div className="t3-grow">
            <p className="t3-eyebrow">
              {c3.UNKNOWN_EYEBROW} · {sign}
            </p>
            <h2 className="t3-title">{sight?.options ? c3.SIGHT_ASK : c3.UNKNOWN_TITLE}</h2>
          </div>
          {tracks > 0 && siblings > 0 && !sight?.options && step}
          <Close onClose={onClose} />
        </div>
        {sight?.options ? (
          <>
            {/* 4 names, 2 a row, by the short name each wears on the board. */}
            <div role="group" aria-label={c3.SIGHT_BUTTON} className="t3-row t3-names">
              {sight.options.map((o) => (
                <button key={o.id} type="button" data-t3-sight-option={o.id} className="t3-btn" onClick={() => sight.onName(o.id)}>
                  {o.name}
                </button>
              ))}
            </div>
            <p className="t3-hint" data-t3-sight-ask>
              {c3.SIGHT_TERMS}
            </p>
          </>
        ) : (
          <>
            {/* Named wrong: said where the eye is, in place of the line it has read. */}
            <p className={`t3-hook${sight?.missed ? ' t3-warn' : ''}`} data-t3-sight-state={sight?.missed ? 'missed' : undefined}>
              {sight?.missed ? c3.SIGHT_MISSED : c3.unknownBody(siblings)}
            </p>
            <div className="t3-row">
              <button type="button" data-t3-scan={contact.id} className="t3-btn t3-primary t3-scanbtn" disabled={scanLeft <= 0 || scanning} onClick={onScan}>
                {scanning ? 'SCANNING' : scanLeft > 0 ? c3.scanButton(scanLeft) : c3.NO_PULSES}
              </button>
              {sight && !sight.missed && (
                <button type="button" data-t3-sight={contact.id} className="t3-btn" disabled={scanning} onClick={sight.onOpen}>
                  {c3.SIGHT_BUTTON}
                </button>
              )}
            </div>
            {sight && !sight.missed && <p className="t3-hint">{c3.KNOW_THE_LOOK}</p>}
          </>
        )}
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
            <span className={tone}>{contact.debris ? c3.FAVOR_TAG.confirmed : contact.exposed === 0 ? 'STOPPED' : c3.FAVOR_TAG[contact.favor]}</span> · {sign}
            {contact.hardened > 0 ? ` · ${c3.postTook(contact.hardened)}` : ''}
            {filed ? '' : ' · NEW'}
          </p>
          <h2 className={`t3-title${shortName(def).length > 26 ? ' is-long' : ''}`}>
            {shortName(def)} {!contact.debris && <i className="t3-bad">{dots(contact.strength)}</i>}
          </h2>
        </div>
        {step}
        <Close onClose={onClose} />
      </div>
      <p className="t3-hook">{copy.HOOK[def.id] ?? def.name}.</p>
      <p className="t3-fav" data-t3-favor>
        {contact.debris ? c3.DEBRIS_NOTE : `Strength ${contact.strength}. ${contact.favor === 'unlikely' ? (contact.exposed === 0 ? c3.FAVOR_STOPPED : c3.FAVOR.unlikely) : `${c3.FAVOR[contact.favor]} ${c3.aboutLoss(contact.loss)}`}`}
      </p>
      {answers.map((a) => {
        const lockedBy = !a.ordered && !a.owned && locked ? ` · ${c3.replaces(locked).replace(/\.$/, '')}` : ''
        const line = a.owned ? c3.OWNED : a.ordered ? `${c3.PLACED} · tap to take it back` : `${verbWord(a.verb)} it${a.then ? `, ${a.then}` : ', every night'}${lockedBy}${a.risky ? `. ${c3.riskyBy(a.odds, a.soon)}` : ''}`
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
export function PieceCard({ piece, targets, postCost, locked, upkeep, placedOn, onPlace, onRemove, onClose }: { piece: KitPiece; targets: { id: string; sign: string; best?: boolean }[]; postCost?: string; locked: string | null; upkeep: number; placedOn?: string; onPlace: (assetId: string) => void; onRemove: () => void; onClose: () => void }) {
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
      {piece.risky && !piece.ordered && <p className="t3-note">{c3.riskyBy(piece.odds, piece.soon)}.</p>}
      {!piece.risky && !piece.ordered && !piece.blocked && piece.worst < 0 && (
        <p className="t3-note" data-t3-tight>
          {c3.tightBy(piece.worst)}
        </p>
      )}
      {piece.ordered ? (
        <>
          {placedOn && <p className="t3-fav t3-ok">{c3.postLine(placedOn)}</p>}
          <button type="button" data-t3-remove className="t3-btn" onClick={onRemove}>
            {c3.TAKE_BACK}
          </button>
        </>
      ) : piece.blocked ? null : (
        <>
          {/* No spot is called best when every one costs the post (v2.0 R4): what it gives up is said first, over the spots. */}
          {(postCost || locked) && (
            <p className="t3-hint t3-warn" data-t3-postcost={postCost ? '' : undefined}>
              {locked ? `${c3.replaces(locked)} ` : ''}
              {postCost}
            </p>
          )}
          <div className="t3-row t3-wrap">
            {targets.map((t) => (
              <button key={t.id} type="button" data-t3-place={t.id} data-best={t.best || undefined} className={`t3-btn${t.best ? ' t3-primary' : ''}`} onClick={() => onPlace(t.id)}>
                {c3.placeOn(t.sign)}
                {t.best ? <span> · {c3.BEST_SPOT}</span> : null}
              </button>
            ))}
          </div>
          {!postCost && <p className="t3-hint">{c3.PLACE_NOTE}</p>}
        </>
      )}
    </div>
  )
}

export function AssetCard({ asset, sign, contacts, conditions, modules, post, onContact, onClose }: { asset: Asset; sign: string; contacts: Contact[]; conditions: { name: string; left: number }[]; modules: string[]; post: boolean; onContact: (id: string) => void; onClose: () => void }) {
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
          {nightly(copy.conditionTag(c.name, Math.max(0, c.left - 1)))}. {c3.CONDITION_NOTE}
        </p>
      ))}
      {post && <p className="t3-fav t3-ok">{c3.POST_HERE}.</p>}
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
              {f.ordered ? `${c3.ORDERED} · ${(signs[f.kind] ?? '').replace(/-/g, '\u2011')} ${c3.arrivesIn(f.eta)} · tap to cancel` : f.fits ? `${c3.coverageOf(COVERAGE_PER_KIND[f.kind])} · ${c3.arrivesIn(f.eta)}${f.risky ? `. ${c3.riskyBy(f.odds, f.soon)}` : ''}` : 'Not enough budget tonight'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ the night

// One of tonight's moves still to come, as the watch knows it.
export interface Queued {
  id: string
  // Its name, when the scan named it before the night (or it is confirmed).
  name: string | null
  strength: number
  sign: string
  // What stands in its way already: a defense stops it, or the watch post
  // takes a point off, or nothing.
  state: 'stopped' | 'post' | 'open'
}

// THE ANSWER, BESIDE ITS TARGET. Each answer is a piece: drag it onto the
// target, make its gesture on the world, or tap it. It spends 1 of the
// operation's answers (`pool`).
export function ChoiceCard({
  step,
  choices,
  sign,
  chain,
  queue,
  pool,
  first,
  onRespond,
  startDrag,
}: {
  step: NightStep
  choices: Choice[]
  sign: string
  chain: boolean
  // The moves still to come tonight after this one.
  queue: Queued[]
  pool: { left: number; of: number; nightsLeft: number }
  first: RefObject<HTMLButtonElement | null>
  onRespond: (id: string | null) => void
  startDrag: StartDrag
}) {
  const { ev, def } = step
  const strength = ev.baseSeverity + ev.chainBonus
  const exposed = exposedOf(ev)
  const { held } = defensesFor(def, step.before.counters, step.before.scenario)
  const took = [held && ev.mitigation > 0 ? `your ${PIECE[held.id]} takes ${ev.mitigation} off` : '', ev.hardened ? `the watch post takes ${ev.hardened} off` : ''].filter(Boolean)
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  return (
    <div className="t3-card t3-respond" key={`choose-${step.index}`} data-t3-card="respond">
      <div className="t3-head">
        <SignatureGlyph id={def.id} size={40} className="t3-glyph-big" />
        <div className="t3-grow">
          <p className="t3-eyebrow t3-bad">INCOMING · {sign}</p>
          <h2 className="t3-title" aria-label={`${shortName(def)}, strength ${strength}`}>
            {c3.TAG[def.id] ?? shortName(def)} <i className="t3-bad">{dots(strength)}</i>
          </h2>
        </div>
        <p className="t3-pool" data-t3-pool={pool.left} aria-label={c3.answersLeft(pool.left, pool.of)}>
          <span>{c3.ANSWERS}</span>
          <b aria-hidden="true">
            {'●'.repeat(pool.left)}
            {'○'.repeat(Math.max(0, pool.of - pool.left))}
          </b>
        </p>
      </div>
      <p className="t3-hook">
        {chain ? `${copy.CHAIN_ADDS}. ` : ''}
        {took.length ? `Strength ${strength}. ${cap(took.join(', and '))}; ${exposed} gets through.` : copy.exposedLine(strength, exposed)}
      </p>
      <div role="group" aria-label={copy.YOUR_RESPONSE} className="t3-choices">
        {choices.map((c, k) => {
          const label = c.id ? (RESPONSE_TEXT[def.id]?.[c.id] ?? c.id) : copy.RIDE_IT_OUT
          const effect = c.fits ? copy.effectLine(c.effect, c.score, c.repair) : copy.EFFECT_WORD[c.effect]
          const why = c.fits ? '' : c3.NO_ANSWERS
          const cost = !c.id ? copy.FREE : c3.ONE_ANSWER
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
              <span className="t3-choice-sub">{why || effect}</span>
            </button>
          )
        })}
      </div>
      {queue.length > 0 ? (
        <div className="t3-queue" data-t3-queue aria-label={`${c3.ALSO_TONIGHT}: ${queue.length} more move${queue.length === 1 ? '' : 's'}`}>
          <span>{c3.ALSO_TONIGHT}</span>
          {queue.map((q) => (
            <p key={q.id} data-t3-queued={q.id} data-state={q.state}>
              <SignatureGlyph id={q.id} size={26} named={q.name !== null} />
              <b>{q.name ?? c3.UNKNOWN_LEAD}</b>
              {q.name !== null && <i className="t3-bad">{dots(q.strength)}</i>}
              <small>
                {q.sign}
                {q.state === 'stopped' ? ' · your defense stops it' : q.state === 'post' ? ' · watch post -1' : ''}
              </small>
            </p>
          ))}
        </div>
      ) : null}
      <p className="t3-foot" data-t3-response-budget>
        {choices.some((c) => c.effect === 'block') ? '' : `${c3.NO_BLOCK} `}
        {queue.length === 0 ? `${c3.LAST_MOVE} ` : ''}
        {c3.answersNote(pool.left, pool.nightsLeft)}
      </p>
    </div>
  )
}

// THE TIE-BREAK (v2.0 R2, Ken's mechanic of 14 November 2026). The fleet's
// own policy engine has stopped one of the fleet's own actions. Three
// checks are on the card, in the content's words, with nothing marked:
// the player reads them and makes the call, on 2 targets the width of a
// thumb each. `seconds` is the clock, or null when there is none (the
// first hold on a device, Assist, Reduce Motion): then it waits.
export function HoldCard({
  template,
  dirty,
  sign,
  kind,
  seconds,
  total,
  hint,
  stake,
  first,
  onCall,
}: {
  // What a wrong call costs, in points of score, at this difficulty.
  stake: number
  // The first hold a device meets says what is being asked, once.
  hint?: string
  template: HoldTemplate
  dirty: readonly number[]
  sign: string
  kind: AssetKind
  seconds: number | null
  total: number
  first: RefObject<HTMLButtonElement | null>
  onCall: (call: HoldCall) => void
}) {
  return (
    <div className="t3-card t3-hold" key="hold" data-t3-card="hold" role="group" aria-label={c3.HOLD_HEAD}>
      {seconds !== null && (
        <span className="t3-holdclock" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(100, (seconds / total) * 100))}%` }} />
        </span>
      )}
      <p className="t3-eyebrow t3-warn">
        {c3.HOLD_HEAD}
        <span className="t3-right" data-t3-hold-clock role={seconds !== null ? 'timer' : undefined} aria-label={seconds !== null ? c3.holdClock(Math.ceil(seconds)) : c3.HOLD_NO_CLOCK}>
          {seconds !== null ? `${Math.ceil(seconds)} s, then it stands` : 'no clock'}
        </span>
      </p>
      {hint && (
        <p className="t3-holdhint" data-t3-guide="hold">
          {hint}
        </p>
      )}
      <h2 className="t3-title">
        {sign} <small>{kindLabels[kind]}</small>
      </h2>
      <p className="t3-hook">{template.action}.</p>
      <p className="t3-fav t3-warn">
        <b>{c3.RULE_TRIPPED}:</b> {template.rule}
      </p>
      <dl className="t3-evidence" data-t3-evidence aria-label={c3.EVIDENCE}>
        {template.checks.map((c, i) => (
          <div key={c.label} data-t3-check={i}>
            <dt>{c.label}</dt>
            <dd>{dirty.includes(i) ? c.dirty : c.clean}</dd>
          </div>
        ))}
      </dl>
      <p className="t3-foot" data-t3-hold-stake>
        {c3.holdStakes(stake)}
      </p>
      <div className="t3-calls" role="group" aria-label="Your call">
        <button ref={first} type="button" data-t3-hold="override" className="t3-call t3-call-override" onClick={() => onCall('override')}>
          <b>{c3.OVERRIDE}</b>
          <span>{c3.OVERRIDE_SUB}</span>
        </button>
        <button type="button" data-t3-hold="stand" className="t3-call t3-call-stand" onClick={() => onCall('stand')}>
          <b>{c3.STAND}</b>
          <span>{c3.STAND_SUB}</span>
        </button>
      </div>
    </div>
  )
}

// What the call was worth, at once: the truth, the check that told it,
// what it cost or kept, and its entry in the override log.
export function HoldResultCard({ hold, template, sign, entry, first, onContinue }: { hold: ResolvedHold; template: HoldTemplate; sign: string; entry: number; first: RefObject<HTMLButtonElement | null>; onContinue: () => void }) {
  const tone = hold.right ? 'blocked' : 'hit'
  // No call is no call, whichever way it fell: the machine's block stood.
  const verdict = hold.call === 'none' ? c3.HOLD_VERDICT.none : hold.right ? c3.HOLD_VERDICT.right : c3.HOLD_VERDICT.wrong
  const tells = hold.dirty.map((i) => `${template.checks[i].label}: ${template.checks[i].dirty}`)
  return (
    <div className={`t3-card t3-result-${tone}`} key="hold-result" data-t3-card="hold-result" data-t3-verdict={hold.right ? 'right' : 'wrong'} data-t3-truth={hold.compromised ? 'compromised' : 'clean'}>
      <div className="t3-verdict">
        <b className={`t3-${tone}`}>{verdict}</b>
        <span>{hold.compromised ? c3.HOLD_TRUTH.compromised : c3.HOLD_TRUTH.clean}</span>
        {!hold.right && (
          <span className="t3-right" data-t3-delta>
            {c3.holdCost(hold.cost)}
          </span>
        )}
      </div>
      {hold.right && (
        <p className="t3-tagsline" data-t3-delta>
          <span className="t3-ok">{c3.holdSaved(hold.saved)}</span>
        </p>
      )}
      <p className="t3-helped">
        {sign}: {c3.youCalled[hold.call]} {hold.call === 'none' ? (hold.right ? c3.MACHINE_RIGHT : c3.MACHINE_WRONG) : ''} {c3.holdTell(tells)}
      </p>
      {!hold.right && <p className="t3-helped t3-warn">{hold.compromised ? template.ifOverridden : template.ifStood}</p>}
      <p className="t3-tagsline">
        <span>{c3.loggedAs(entry)}</span>
      </p>
      <button ref={first} type="button" data-t3-continue className="t3-btn t3-primary" onClick={onContinue}>
        {copy.CONTINUE}
      </button>
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
  saved,
  placed,
  onContinue,
}: {
  // The defense set down tonight, when one was.
  placed?: CountermeasureId | null
  // The score the tap kept on this move, measured against no tap.
  saved?: number
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
    // Tonight's own order is not in the fleet's call signs until the night closes.
    const lines = opportunityLines(step, new Map([...callSigns(step.after), ...signs])).map((l) => (turns && l === copy.briefFreeLine(turns) ? c3.alliedLine(Math.min(turns, step.before.scenario.totalTurns - step.before.turn)) : nightly(l)))
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
  // Had the piece been in service COLDVEIL might have left this move for
  // another (v2.0 R4): then it is not what would have helped tonight, and
  // the line says what it does and what COLDVEIL would have done.
  const dodge = missing && !ev.response && !held ? dodgeOf(step.before, def, missing.id, placed) : undefined
  const helped = missing
    ? dodge
      ? // By the short names the board wears, so the switch is inside a phone's 3 lines.
        c3.wouldSwitch(piece, missing.cost, stopVerb(missing.id, def) === 'stops' ? 'stops' : 'blunts', c3.TAG[def.id] ?? shortName(def), c3.TAG[dodge.id] ?? shortName(dodge), placed ? PIECE[placed] : undefined)
      : joined(ev.response ? copy.lastingAnswer(piece, missing.cost) : held ? copy.finishedIt(piece, missing.cost) : copy.wouldHaveHelped(piece, missing.cost))
    : ''
  const stops = missing && !held && !dodge ? ` It ${stopVerb(missing.id, def) === 'stops' ? 'stops' : 'blunts'} ${shortName(def)} every night.` : ''
  const byDefense = verdict === 'blocked' && blockedBy(ev) === 'defense' && held
  // Stopped with no defense that answers it and no answer: the post did it.
  const byPost = verdict === 'blocked' && !ev.response && !held && !!ev.hardened
  const tap = tapLine(ev, assist, saved)
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
          <span data-t3-took={ev.response.id}>{RESPONSE_TEXT[def.id]?.[ev.response.id] ?? ev.response.id} · 1 answer</span>
        ) : ev.left !== undefined ? (
          <span data-t3-took={ev.left === 0 ? 'used' : 'ride'}>{ev.left === 0 ? c3.NO_ANSWERS : copy.RODE_OUT}</span>
        ) : null}
        {tap && (
          <span className="t3-ok" data-t3-tapline>
            {tap}
          </span>
        )}
        {ev.hardened ? <span className="t3-ok">{c3.postTook(ev.hardened)}</span> : null}
        {ev.repairCost > 0 && <span>{copy.repairTag(ev.repairCost, ev.integrityAfter !== undefined)}</span>}
        {ev.condition && <span className="t3-warn">{nightly(copy.conditionTag(ev.condition.name, Math.max(0, Math.min(ev.condition.turns - 1, step.before.scenario.totalTurns - step.before.turn))))}</span>}
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
        {byPost
          ? c3.POST_STOPPED
          : byDefense && held
          ? joined(partner ? copy.canNowSayWith(held.name, shortName(def), partner.name) : copy.canNowSay(held.name, shortName(def)))
          : `${ev.response ? `${copy.TONIGHT_ONLY} ` : ''}${helped}${stops}${could && could.id ? ` An answer was there: ${RESPONSE_TEXT[def.id]?.[could.id] ?? could.id}.` : ''}`}
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
      {used && <p className="t3-hint t3-warn">{c3.NO_ANSWERS}.</p>}
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
  const partial = threats.filter((s) => verdictOf(s.ev) === 'partial').length
  const l = rec.ledger
  // FIX NEXT (gameModel.ts, fixNext): the piece for the costliest move that
  // got through, unless placing it tomorrow would cost the watch post.
  const through = threats.filter((s) => s.ev.effectiveSeverity > 0).sort((a, b) => a.scoreAfter - a.scoreBefore - (b.scoreAfter - b.scoreBefore))
  const worst = through[0]
  const advice = fixNext(after, through.map((s) => s.def))
  const clean = !!advice?.cm && !advice.gives
  const fix = !advice
    ? copy.NOTHING_THROUGH
    : advice.cm && advice.gives
      ? c3.fixCostsPost(shortName(advice.def), PIECE[advice.cm.id], signs.get(advice.gives) ?? advice.gives)
      : advice.cm
        ? joined(copy.fixDefense(PIECE[advice.cm.id], advice.cm.cost, shortName(advice.def), stopVerb(advice.cm.id, advice.def) === 'stops' ? 'stops' : 'blunts'))
        : `${shortName(advice.def)} got through. Keep an answer for a move like it.`
  const hold = rec.hold
  const parts = [
    l.ordered ? `Orders -${l.ordered}` : '',
    l.fuel ? `Fuel -${l.fuel}` : '',
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
        {c3.dawnOf(rec.turn)} · {threats.length === 0 ? 'A QUIET NIGHT' : stopped === threats.length ? c3.CLEAN : c3.stoppedOf(stopped, threats.length, halved, partial)}
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
      {!over && answersOf(after) > 0 && (
        <p className="t3-tagsline" data-t3-dawn-answers>
          <span className={answersLeft(after) === 0 ? 't3-warn' : ''}>
            {c3.ANSWERS} {'●'.repeat(answersLeft(after))}
            {'○'.repeat(answersOf(after) - answersLeft(after))} · {answersLeft(after)} left for {before.scenario.totalTurns - rec.turn} more night{before.scenario.totalTurns - rec.turn === 1 ? '' : 's'}
          </span>
        </p>
      )}
      {hold && (
        <p className="t3-tagsline" data-t3-dawn-hold>
          <span className={hold.right ? 't3-ok' : 't3-warn'}>
            {hold.call === 'none' ? c3.HOLD_VERDICT.none : hold.right ? c3.HOLD_VERDICT.right : c3.HOLD_VERDICT.wrong} on the hold · {hold.right ? c3.HOLD_NO_COST : c3.holdCost(hold.cost).toLowerCase()}
          </span>
        </p>
      )}
      {!over && (
        <p className="t3-helped">
          {worst && clean ? <span className="t3-warn">{copy.FIX_LABEL} </span> : null}
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
