// THE 3D GAME'S ROOMS (v2.0 R1): the debrief with its grade and NEXT TIME,
// the after-action replay that scrubs the nights in the world beside a
// ghost run, the Dossier as a place to visit, and SYSTEM. Everything a
// figure says comes from the engine's record through the debrief's own
// model (src/ui/debriefModel.ts) and the game's model (gameModel.ts).

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useSoundPrefs } from '../../audio'
import { DEFAULT_SCENARIO, THREAT_EVENT_COUNT } from '../../content'
import { RESPONSE_TEXT } from '../../content/responseText'
import { MOMENT_CUES, gradeSound, type SoundCue } from '../../cues'
import { turnStrip } from '../../engine/grade'
import { DIFFICULTIES } from '../../engine/reducer'
import type { CountermeasureId, GameState, TurnActions } from '../../engine/types'
import { captureGame, dossier, encodeSaveCode, readRun, type DailyOp, type DailyStanding } from '../../persistence'
import { shortName, stoppedByLine } from '../board/boardModel'
import { copyToClipboard, shareOrCopy } from '../clipboard'
import { setMotionSettingOff, useMotionSettingOff } from '../cues/motion'
import { clock, debriefStats, gradeBlock, nextTime, threatName, type NextTime } from '../debriefModel'
import { techniqueLabel, vectorLabels } from '../labels'
import * as copy from '../night/nightCopy'
import { defensesFor, type Night } from '../night/nightModel'
import { shareText } from '../reportCard'
import { VERDICT_WORD, dots } from './cards3d'
import * as c3 from './copy3d'
import { PIECE, coachRun, finalScore, inputsOf, nightsOf, placedOn, timeline, verdictOf } from './gameModel'
import { SignatureGlyph } from './glyphs'
import { hitLog, progress, unlocksFor, type OpeningId, type PostureId, type Prefs } from './store3d'
import type { Impact } from './theater'
import type { SkinId, World } from './world'

// The reading list a Dossier card opens: the Field Library's own screen.
const FieldLibrary = lazy(() => import('../FieldLibrary'))

const tenth = (n: number) => Math.round(n * 10) / 10
type Play = (cue: SoundCue) => void

// ------------------------------------------------------------ NEXT TIME

// The debrief's one lesson, in the 3D game's words (a night, a piece
// placed), from the same measured replay the pixel debrief reads.
export function nextTimeText(state: GameState, next: NextTime | null): string {
  const line = state.scenario.winThreshold
  if (state.lossReason === 'insolvency') return `Keep WORST CASE at 0 or above. Orders, upkeep and repairs took the budget below zero on night ${state.history.length}.`
  const ends = (final: number, was: number, won: boolean) =>
    `this game ends at ${final.toFixed(1)}, not ${was.toFixed(1)}${won ? (state.status !== 'won' ? ', and is won' : '') : `, still under the win line of ${line}`}.`
  if (next?.kind === 'earlier') {
    const lead = next.procured !== null ? `You placed ${next.defense} on night ${next.procured}. Place it on night ${next.orderOn}` : `Place ${next.defense} (${next.price} CR) on night ${next.orderOn}`
    const ahead = next.ahead === null ? '' : next.aheadTo !== null ? ` and move ${next.ahead} to night ${next.aheadTo}` : ` in place of ${next.ahead}`
    return `${lead}${ahead}. Played again with every other order the same, ${ends(next.final, next.was, next.won)}`
  }
  if (next?.kind === 'answer')
    return `On night ${next.turn}, answer ${threatName(state, next.move)} in the night: ${RESPONSE_TEXT[next.move]?.[next.response] ?? next.response} (${next.cost} CR). Played again with every order the same, ${ends(next.final, next.was, next.won)}`
  if (next?.kind === 'none') return 'No single change this game missed ends it higher.'
  return state.history.some((r) => r.events.some((e) => e.effectiveSeverity > 0)) ? 'Every move that got through met a defense you already had.' : 'Nothing got through.'
}

// THE GHOST RUN: this game played again with NEXT TIME's one change, or,
// where there is none to show, a careful watch on the same seed.
export function ghostOf(state: GameState, next: NextTime | null): { states: GameState[]; kind: 'change' | 'coach' } {
  const base = inputsOf(state)
  const idOf = (name: string | null) => state.scenario.countermeasures.find((c) => c.name === name)?.id
  let changed: TurnActions[] | null = null
  if (next?.kind === 'earlier') {
    const id = idOf(next.defense)
    if (id) {
      changed = base.map((o) => ({ ...o, buyCounters: o.buyCounters.filter((c) => c !== id) }))
      if (changed[next.orderOn - 1]) changed[next.orderOn - 1] = { ...changed[next.orderOn - 1], buyCounters: [id] }
      const ahead = idOf(next.ahead)
      if (ahead && next.aheadTo !== null && changed[next.aheadTo - 1]) changed[next.aheadTo - 1] = { ...changed[next.aheadTo - 1], buyCounters: [ahead as CountermeasureId] }
    }
  } else if (next?.kind === 'answer') {
    const rec = state.history[next.turn - 1]
    const i = rec?.events.findIndex((e) => e.eventId === next.move) ?? -1
    if (rec && i >= 0) changed = base.map((o, k) => (k === next.turn - 1 ? { ...o, responses: rec.events.map((_, j) => (j === i ? next.response : null)) } : o))
  }
  if (changed) {
    const states = timeline(state, changed)
    if (states.length > 1 && states[states.length - 1].status !== 'playing' && next && 'final' in next && Math.abs(finalScore(states) - next.final) < 0.06) return { states, kind: 'change' }
  }
  return { states: coachRun(state), kind: 'coach' }
}

// -------------------------------------------------------------- DEBRIEF

const STRIP_CLASS = { green: 't3-sq-go', amber: 't3-sq-warn', magenta: 't3-sq-bad' } as const

export function Debrief({
  state,
  daily,
  standing,
  earned,
  run,
  reduced,
  play,
  onReplay,
  onDossier,
  onAgain,
  onExit,
}: {
  state: GameState
  daily?: DailyOp
  standing: DailyStanding | null
  earned: string[]
  run: string
  reduced: boolean
  play: Play
  onReplay: () => void
  onDossier: () => void
  onAgain: () => void
  onExit: () => void
}) {
  const block = useMemo(() => gradeBlock(state), [state])
  const stats = useMemo(() => debriefStats(state), [state])
  const next = useMemo(() => nextTime(state), [state])
  const strip = useMemo(() => turnStrip(state), [state])
  const [said, setSaid] = useState('')
  const [codeOpen, setCodeOpen] = useState(false)
  const stamp = useRef(new Date().toISOString())
  const code = useMemo(() => encodeSaveCode(captureGame(state, 'aftermath', stamp.current, daily)), [state, daily])
  const ms = readRun(run)?.ms
  const first = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => play(gradeSound(block.won)), reduced ? 0 : 700)
    first.current?.focus({ preventScroll: true })
    return () => window.clearTimeout(id)
    // Once, as the debrief opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const share = async () => {
    const out = await shareOrCopy(shareText(state, daily ? { n: daily.n, official: standing === 'official' } : undefined))
    setSaid(out === 'copied' ? c3.SHARED : out === 'failed' ? 'Could not share from this browser.' : '')
  }
  const earnedNames = earned.map((e) => {
    const [kind, id] = e.split(':')
    return kind === 'skin' ? `${c3.SKIN}: ${c3.SKINS[id as SkinId].name}` : kind === 'posture' ? `${c3.POSTURE}: ${c3.POSTURES[id as PostureId].name}` : `${c3.OPENING_PICK}: ${c3.OPENINGS[id as OpeningId].name}`
  })
  const diff = DIFFICULTIES[state.difficulty].label

  return (
    <div className="t3-debrief" role="dialog" aria-label={c3.PHASE.debrief} data-t3-debrief data-t3-grade={block.grade}>
      <div className="t3-debrief-in">
        <header className={`t3-gradehead ${block.won ? 'is-won' : 'is-lost'}`}>
          <p className="t3-eyebrow">
            {daily ? c3.dailyTag(daily.n) : diff}
            {state.posture === 'dark' ? ' · RUNNING DARK' : ''} · SEED {state.seed}
          </p>
          <h2 className={block.won ? 't3-ok' : 't3-bad'}>{block.head}</h2>
          <div className="t3-grade" data-t3-grade-letter aria-label={`${c3.GRADE} ${block.grade}`}>
            <span>{c3.GRADE}</span>
            <b>{block.grade}</b>
          </div>
          <p className="t3-final" data-t3-final-score>
            {c3.FINAL} <b>{block.final.toFixed(1)}</b> <small>{c3.winLine(block.needed)}</small>
          </p>
          <p className="t3-hook">
            {block.reason.replace(/\bturn\b/g, 'night').replace(/\bTurn\b/g, 'Night')}
            {block.bonus ? ` Defense bonus +${block.bonus.bonus.toFixed(1)}: graded on ${block.bonus.graded.toFixed(1)}.` : ''}
          </p>
          {daily && <p className="t3-hint">{standing === 'official' ? c3.OFFICIAL_DAILY : c3.PRACTICE_DAILY}</p>}
        </header>

        <div className="t3-strip" aria-label={`The nights: ${strip.map((s, i) => `night ${i + 1} ${s === 'green' ? 'held' : s === 'amber' ? 'slipped' : 'fell'}`).join(', ')}`}>
          {strip.map((s, i) => (
            <i key={i} className={STRIP_CLASS[s]}>
              {i + 1}
            </i>
          ))}
        </div>

        <dl className="t3-stats" data-t3-stats>
          {stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                {s.value.toFixed(s.decimals)}
                {s.unit ? <small> {s.unit}</small> : null}
              </dd>
            </div>
          ))}
          {ms !== undefined && ms > 0 && (
            <div>
              <dt>{c3.TIME}</dt>
              <dd>{clock(ms)}</dd>
            </div>
          )}
        </dl>

        <section className="t3-next" data-t3-next-time>
          <h3>{c3.NEXT_TIME}</h3>
          <p>{nextTimeText(state, next)}</p>
          <button ref={first} type="button" data-t3-replay className="t3-btn t3-primary" onClick={onReplay}>
            {c3.REPLAY}
          </button>
        </section>

        {earnedNames.length > 0 && (
          <section className="t3-earned" data-t3-earned>
            <h3>{c3.UNLOCKED}</h3>
            {earnedNames.map((n) => (
              <p key={n}>{n}</p>
            ))}
            <p className="t3-hint">Choose them in SYSTEM, the menu at the top left.</p>
          </section>
        )}

        <div className="t3-row t3-wrap">
          <button type="button" data-t3-again className="t3-btn t3-primary" onClick={onAgain}>
            {c3.AGAIN}
          </button>
          <button type="button" data-t3-dossier-open className="t3-btn" onClick={onDossier}>
            {c3.DOSSIER} {dossier().size}/{THREAT_EVENT_COUNT}
          </button>
          <button type="button" data-t3-share className="t3-btn" onClick={() => void share()}>
            {c3.SHARE}
          </button>
          <button type="button" data-t3-exit className="t3-btn" onClick={onExit}>
            {c3.TITLE}
          </button>
        </div>
        {said && (
          <p className="t3-hint" role="status">
            {said}
          </p>
        )}

        <div className="t3-code" data-t3-save-code>
          <button type="button" className="t3-btn t3-quietbtn" aria-expanded={codeOpen} onClick={() => setCodeOpen((o) => !o)}>
            {c3.SAVE_CODE}
          </button>
          {codeOpen && (
            <>
              <textarea readOnly value={code} aria-label="Save code for this operation" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="t3-btn" onClick={async () => setSaid((await copyToClipboard(code)) ? 'Save code copied to clipboard.' : 'Copy failed. Select the code above and copy it.')}>
                {c3.COPY_CODE}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------- AFTER-ACTION REPLAY

// THE NIGHTS, SCRUBBED IN THE WORLD. Pick a night and it plays: each
// strike on its target, how it ended, and at each hit what would have
// helped. YOU and GHOST are the same seed, side by side.
export function ReplayDock({ state, world, reduced, play, onBack }: { state: GameState; world: RefObject<World | null>; reduced: boolean; play: Play; onBack: () => void }) {
  const you = useMemo(() => timeline(state, inputsOf(state)), [state])
  const ok = you.length === state.history.length + 1 && Math.abs(finalScore(you) - (state.history[state.history.length - 1]?.maiScore ?? 0)) < 0.06
  const next = useMemo(() => nextTime(state), [state])
  const ghost = useMemo(() => ghostOf(state, next), [state, next])
  const nights = useMemo(() => ({ you: nightsOf(you), ghost: nightsOf(ghost.states) }), [you, ghost])
  const [who, setWho] = useState<'you' | 'ghost'>('you')
  const [n, setN] = useState(1)
  const [shown, setShown] = useState(0)
  const token = useRef(0)
  const list = nights[who]
  const night: Night | undefined = list[Math.min(n, list.length) - 1]

  const stage = (nt: Night, animate: boolean) => {
    const t = world.current
    if (!t) return
    const mine = ++token.current
    t.setSpeed(1.6)
    t.setBeat('night')
    t.clearSignatures()
    t.clearNight()
    t.setAims([])
    t.setFocus(null)
    for (const a of state.assets) {
      const was = nt.before.assets.find((x) => x.id === a.id)
      if (!was || was.integrity <= 0) t.setLost(a.id, true)
      else {
        t.setLost(a.id, false)
        t.setIntegrity(a.id, was.integrity)
      }
    }
    t.setStreak(nt.before.streak)
    setShown(animate ? 0 : nt.steps.length)
    if (!animate) return
    void (async () => {
      for (const s of nt.steps) {
        if (token.current !== mine) return
        const target = s.ev.targetAssetId
        if (s.kind === 'threat' && target && state.assets.some((a) => a.id === target) && nt.before.assets.some((a) => a.id === target && a.integrity > 0)) {
          const v = verdictOf(s.ev)
          const impact: Impact = v === 'blocked' ? 'blocked' : v === 'hit' ? 'hit' : 'halved'
          if (v === 'blocked') t.setShield(target, s.ev.response ? 'response' : 'defense')
          t.setSignature('strike', s.def.id, target, 0.9)
          await t.quickStrike(`replay-${s.index}`, target, impact)
          if (token.current !== mine) return
          play(v === 'blocked' ? MOMENT_CUES['strike-block'].sound : MOMENT_CUES['strike-hit'].sound)
          t.setSignature('strike', null)
          if (s.ev.integrityAfter !== undefined) t.setIntegrity(target, s.ev.integrityAfter)
        }
        t.setStreak(s.streak)
        setShown(s.index + 1)
        await t.wait(0.35)
      }
      t.clearNight()
    })()
  }

  useEffect(() => {
    if (ok && night) stage(night, !reduced)
    // A night picked is a night played.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, n, ok])
  useEffect(
    () => () => {
      token.current += 1
      const t = world.current
      t?.setSpeed(1)
      t?.clearSignatures()
      t?.clearNight()
    },
    [world],
  )

  if (!ok || !night) {
    return (
      <div className="t3-card" data-t3-card="replay">
        <p className="t3-hook">{c3.REPLAY_NONE}</p>
        <button type="button" className="t3-btn" data-t3-replay-back onClick={onBack}>
          {c3.BACK_TO_DEBRIEF}
        </button>
      </div>
    )
  }

  const count = Math.max(nights.you.length, nights.ghost.length)
  const scores = (ns: Night[]) => ns.map((x) => x.record.maiScore)
  const lineY = state.scenario.winThreshold
  const all = [...scores(nights.you), ...scores(nights.ghost), lineY]
  const lo = Math.min(...all) - 3
  const hi = Math.max(...all, 90) + 2
  const px = (i: number) => 14 + (i / Math.max(1, count - 1)) * 252
  const py = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * 48
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join('')
  const placed = placedOn(night)
  const pieces = placed.map((id) => PIECE[id]).join(', ')

  return (
    <div className="t3-card t3-replay" data-t3-card="replay" data-t3-who={who} data-t3-replay-night={n}>
      <div className="t3-head">
        <div className="t3-grow">
          <p className="t3-eyebrow">
            {c3.PHASE.replay} · {c3.nightOf(Math.min(n, list.length), state.scenario.totalTurns)}
          </p>
          <p className="t3-hint">{c3.ghostLead[ghost.kind]}</p>
        </div>
        <div className="t3-seg" role="group" aria-label="Whose run">
          <button type="button" data-t3-who="you" aria-pressed={who === 'you'} onClick={() => setWho('you')}>
            {c3.endsAt(c3.YOU, finalScore(you))}
          </button>
          <button type="button" data-t3-who="ghost" aria-pressed={who === 'ghost'} onClick={() => setWho('ghost')}>
            {c3.endsAt(c3.GHOST, finalScore(ghost.states))}
          </button>
        </div>
      </div>

      <svg className="t3-spark" viewBox="0 0 280 60" role="img" aria-label={`Score by night. You end at ${finalScore(you).toFixed(1)}, the ghost at ${finalScore(ghost.states).toFixed(1)}, win line ${lineY}.`}>
        <path d={`M8 ${py(lineY)}H272`} className="t3-spark-line" />
        <path d={path(scores(nights.ghost))} className={`t3-spark-ghost${who === 'ghost' ? ' is-on' : ''}`} />
        <path d={path(scores(nights.you))} className={`t3-spark-you${who === 'you' ? ' is-on' : ''}`} />
        {scores(list).map((v, i) => (
          <circle key={i} cx={px(i)} cy={py(v)} r={i === n - 1 ? 4.5 : 2.5} className={who === 'you' ? 't3-spark-dot' : 't3-spark-dot is-ghost'} />
        ))}
      </svg>

      <div className="t3-scrub">
        <input type="range" min={1} max={list.length} step={1} value={Math.min(n, list.length)} aria-label="Night" data-t3-scrub onChange={(e) => setN(Number(e.target.value))} />
        <div className="t3-nights" role="group" aria-label="Nights">
          {list.map((x, i) => (
            <button key={x.turn} type="button" data-t3-replay-pick={i + 1} aria-pressed={n === i + 1} onClick={() => setN(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <p className="t3-fav">{pieces ? (who === 'you' ? c3.youPlaced(pieces) : c3.ghostPlaced(pieces)) : c3.NOTHING_PLACED}</p>
      <ul className="t3-events">
        {night.steps.map((s) => {
          if (s.kind === 'opportunity')
            return (
              <li key={s.index} className={s.index < shown ? 'is-in' : ''}>
                <span className="t3-ok">{c3.GOOD_NEWS}</span> {shortName(s.def)}
              </li>
            )
          if (s.kind === 'debris' && s.ev.debris)
            return (
              <li key={s.index} className={s.index < shown ? 'is-in' : ''}>
                <SignatureGlyph id={s.def.id} size={22} />
                <span className={s.ev.debris.lost ? 't3-bad' : 't3-ok'}>{copy.debrisHead(s.ev.debris.lost, s.ev.debris.choice)}</span> {copy.youChose(s.ev.debris.choice).replace('YOU CHOSE', who === 'you' ? 'you chose' : 'ghost chose')}
              </li>
            )
          const v = verdictOf(s.ev)
          const d = tenth(s.scoreAfter - s.scoreBefore)
          const { missing, held } = defensesFor(s.def, night.closing.counters, state.scenario)
          const helped = v === 'blocked' ? (s.ev.response ? copy.youDid(RESPONSE_TEXT[s.def.id]?.[s.ev.response.id] ?? '', s.ev.response.cost) : held ? `${PIECE[held.id]} held it.` : '') : missing ? (held ? copy.finishedIt(missing.name, missing.cost) : copy.wouldHaveHelped(missing.name, missing.cost)).join('') : copy.fixRespond(shortName(s.def))
          return (
            <li key={s.index} className={s.index < shown ? 'is-in' : ''} data-t3-replay-event={v}>
              <SignatureGlyph id={s.def.id} size={22} />
              <span className={`t3-${v}`}>{VERDICT_WORD[v]}</span> {shortName(s.def)} <i>{dots(s.ev.baseSeverity + s.ev.chainBonus)}</i> <b>{d < -0.05 ? d.toFixed(1) : ''}</b>
              <small>{helped}</small>
            </li>
          )
        })}
      </ul>

      <div className="t3-row">
        <button type="button" data-t3-replay-play className="t3-btn t3-primary" onClick={() => stage(night, true)}>
          {c3.PLAY_NIGHT}
        </button>
        <button type="button" data-t3-replay-back className="t3-btn" onClick={onBack}>
          {c3.BACK_TO_DEBRIEF}
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- DOSSIER

// THE DOSSIER, A PLACE TO VISIT: every threat's card with its signature
// moving in miniature, where it has hit this device, its technique and
// every source the deck cites for it. An unfiled card shows its signature
// and nothing else, so a move can be known by its look before its name.
export function DossierRoom({ onBack, backLabel = c3.TITLE, focus }: { onBack: () => void; backLabel?: string; focus?: string }) {
  const filed = dossier()
  const log = hitLog()
  const threats = DEFAULT_SCENARIO.events.filter((e) => (e.kind ?? 'threat') === 'threat')
  const [open, setOpen] = useState<string | null>(focus ?? null)
  const [reading, setReading] = useState<string | null>(null)
  const back = useRef<HTMLButtonElement | null>(null)
  useEffect(() => back.current?.focus({ preventScroll: true }), [])

  // The reading list is the pixel game's own screen, so it opens over the
  // page, outside the 3D game's styles.
  if (reading) {
    return createPortal(
      <div className="t3-reading" role="dialog" aria-modal="true" aria-label="Field Library" data-t3-reading>
        <Suspense fallback={<p>Opening the reading list.</p>}>
          <FieldLibrary embedded focus={reading} backLabel="BACK TO DOSSIER" onBack={() => setReading(null)} />
        </Suspense>
      </div>,
      document.body,
    )
  }

  return (
    <div className="t3-room" role="dialog" aria-label={c3.DOSSIER_HEAD} data-t3-room="dossier">
      <header className="t3-roomhead">
        <button ref={back} type="button" className="t3-btn" data-t3-room-back onClick={onBack}>
          {backLabel}
        </button>
        <div>
          <h2>{c3.DOSSIER_HEAD}</h2>
          <p data-t3-dossier-count>{c3.filedOf(filed.size, threats.length)}</p>
        </div>
      </header>
      <div className="t3-cards">
        {threats.map((def, i) => {
          const has = filed.has(def.id)
          const row = log[def.id]
          const isOpen = open === def.id
          const stopped = stoppedByLine(def, DEFAULT_SCENARIO)
          return (
            <article key={def.id} className={`t3-dcard${has ? ' is-filed' : ''}${isOpen ? ' is-open' : ''}`} data-t3-dcard={def.id} data-filed={has || undefined}>
              <button type="button" className="t3-dcard-head" aria-expanded={has ? isOpen : undefined} disabled={!has} onClick={() => setOpen(isOpen ? null : def.id)}>
                <SignatureGlyph id={def.id} size={56} named={has} />
                <span className="t3-dcard-text">
                  <small>
                    {String(i + 1).padStart(2, '0')} · {has ? `${vectorLabels[def.vector].toUpperCase()} → ${def.layers.join(' + ')}` : c3.UNFILED}
                  </small>
                  <b>{has ? shortName(def) : '? ? ?'}</b>
                  <span>{has ? `${copy.HOOK[def.id] ?? def.name}.` : c3.UNFILED_LINE}</span>
                  {has && <em data-t3-hitline>{row ? [row.hits ? c3.hitYou(row.hits, row.last) : '', row.blocks ? c3.blockedIt(row.blocks) : ''].filter(Boolean).join(' ') : c3.NOT_MET}</em>}
                </span>
              </button>
              {has && isOpen && (
                <div className="t3-dcard-body">
                  <p>{def.blurb}</p>
                  <dl>
                    <dt>{stopped.label}</dt>
                    <dd>{stopped.text}</dd>
                    <dt>{copy.TECHNIQUE}</dt>
                    <dd>
                      {def.techniqueRefs.map((ref) => (
                        <a key={ref.id} href={ref.url} target="_blank" rel="noopener noreferrer">
                          {techniqueLabel(ref)} {ref.name} ↗
                        </a>
                      ))}
                    </dd>
                  </dl>
                  {def.learnMoreCards.map((card) => (
                    <section key={card.title} className="t3-learn">
                      <h4>{card.title}</h4>
                      <p>{card.body}</p>
                      <h5>{c3.SOURCES}</h5>
                      <ul>
                        {card.sources.map((s) => (
                          <li key={s.url}>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" data-t3-source>
                              {s.title} ↗
                            </a>{' '}
                            <small>[{s.type}]</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                  <button type="button" className="t3-btn" data-learn-more={def.id} onClick={() => setReading(def.id)}>
                    {c3.LEARN_MORE} · {c3.READINGS}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- SYSTEM

function Toggle({ id, label, note, on, onChange }: { id: string; label: string; note?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} data-t3-toggle={id} className={`t3-toggle${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span>
        <b>{label}</b>
        {note && <small>{note}</small>}
      </span>
      <i aria-hidden="true" />
    </button>
  )
}

function Picks<T extends string>({ id, head, options, value, unlocked, onPick }: { id: string; head: string; options: Record<T, { name: string; how: string; note?: string }>; value: T; unlocked: Record<T, boolean>; onPick: (v: T) => void }) {
  return (
    <fieldset className="t3-picks" data-t3-picks={id}>
      <legend>{head}</legend>
      {(Object.keys(options) as T[]).map((k) => (
        <button key={k} type="button" aria-pressed={value === k} disabled={!unlocked[k]} data-t3-pick={k} className={value === k ? 'is-on' : ''} onClick={() => onPick(k)}>
          <b>{options[k].name}</b>
          <small>{unlocked[k] ? (options[k].note ?? '') : `${c3.LOCKED}. ${options[k].how}`}</small>
        </button>
      ))}
    </fieldset>
  )
}

export function SystemSheet({
  prefs,
  state,
  daily,
  playing,
  onPrefs,
  onGuide,
  onDossier,
  onClose,
  onExit,
}: {
  prefs: Prefs
  state: GameState
  daily?: DailyOp
  playing: boolean
  onPrefs: (next: Partial<Prefs>) => void
  onGuide: () => void
  onDossier: () => void
  onClose: () => void
  onExit: () => void
}) {
  const [sound, setSound] = useSoundPrefs()
  const motionOff = useMotionSettingOff()
  const unlocked = unlocksFor(progress(), dossier().size)
  const [said, setSaid] = useState('')
  const close = useRef<HTMLButtonElement | null>(null)
  useEffect(() => close.current?.focus({ preventScroll: true }), [])
  const copyCode = async () => {
    const code = encodeSaveCode(captureGame(state, 'brief', new Date().toISOString(), daily))
    setSaid((await copyToClipboard(code)) ? 'Save code copied to clipboard.' : 'Copy failed.')
  }
  return (
    <div className="t3-room t3-system" role="dialog" aria-label={c3.SYSTEM} data-t3-room="system">
      <header className="t3-roomhead">
        <button ref={close} type="button" className="t3-btn" data-t3-room-back onClick={onClose}>
          BACK
        </button>
        <div>
          <h2>{c3.SYSTEM}</h2>
          <p>
            {DIFFICULTIES[state.difficulty].label} · SEED {state.seed}
          </p>
        </div>
      </header>
      <div className="t3-sys">
        <Toggle id="assist" label={c3.ASSIST} note={c3.ASSIST_NOTE} on={prefs.assist} onChange={(on) => onPrefs({ assist: on })} />
        <Toggle id="motion" label={c3.MOTION} on={motionOff} onChange={(on) => setMotionSettingOff(on)} />
        <Toggle id="low" label={c3.LOW_POWER} note={c3.LOW_POWER_NOTE} on={prefs.lowPower} onChange={(on) => onPrefs({ lowPower: on })} />
        <Toggle id="sound" label={c3.SOUND} on={sound.effects} onChange={(on) => setSound((p) => ({ ...p, effects: on }))} />
        <Toggle id="music" label={c3.MUSIC} on={sound.music} onChange={(on) => setSound((p) => ({ ...p, music: on }))} />
        <Picks id="skin" head={c3.SKIN} options={c3.SKINS} value={unlocked.skins[prefs.skin] ? prefs.skin : 'standard'} unlocked={unlocked.skins} onPick={(skin) => onPrefs({ skin })} />
        <Picks id="posture" head={c3.POSTURE} options={c3.POSTURES} value={unlocked.postures[prefs.posture] ? prefs.posture : 'standard'} unlocked={unlocked.postures} onPick={(posture) => onPrefs({ posture })} />
        <Picks id="opening" head={c3.OPENING_PICK} options={c3.OPENINGS} value={unlocked.openings[prefs.opening] ? prefs.opening : 'standard'} unlocked={unlocked.openings} onPick={(opening) => onPrefs({ opening })} />
        <div className="t3-row t3-wrap">
          <button type="button" className="t3-btn" data-t3-sys="dossier" onClick={onDossier}>
            {c3.DOSSIER}
          </button>
          <button type="button" className="t3-btn" data-t3-sys="guide" onClick={onGuide}>
            {c3.REPLAY_GUIDE}
          </button>
          {playing && (
            <button type="button" className="t3-btn" data-t3-sys="code" onClick={() => void copyCode()}>
              {c3.COPY_CODE}
            </button>
          )}
          <a className="t3-btn" data-t3-sys="classic" href="?view=classic">
            {c3.CLASSIC}
          </a>
          <button type="button" className="t3-btn" data-t3-sys="title" onClick={onExit}>
            {c3.TITLE}
          </button>
        </div>
        {said && (
          <p className="t3-hint" role="status">
            {said}
          </p>
        )}
      </div>
    </div>
  )
}
