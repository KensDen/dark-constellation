// THE 3D SLICE (experiment, exp/3d-slice): one night of Dark Constellation
// played in a world, not on panels. The engine, the content and the night's
// words are the game's own; only the presentation is new. Reached from the
// title's TRY 3D (EXPERIMENT) and from ?view=3d, in its own deferred chunk.
//
// The world is the board: tap a tile to see what is aimed at it and order
// a defense, watch COLDVEIL's lines swing as it reacts, then begin the
// night. Each strike flies in from COLDVEIL; one that would land holds
// short of its target while the answers stand beside it, and it then
// breaks on a shield or hits. What teaches is kept, lighter and in place:
// the response's own words, the Dossier card (FILE TO DOSSIER), and what
// would have helped.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import './slice3d.css'
import { strikeIntensity, useMusicState, useSound } from '../../audio'
import { THREAT_EVENT_COUNT } from '../../content'
import { RESPONSE_TEXT } from '../../content/responseText'
import { CONDITION_CUES, EVENT_CUES, MOMENT_CUES, strikeSound } from '../../cues'
import { planFor } from '../../engine/campaign'
import { maiScore } from '../../engine/scoring'
import type { CountermeasureId, Difficulty, GameState, ThreatEvent } from '../../engine/types'
import { callSigns } from '../board/board'
import { TONIGHT_REASON, shortName, stoppedByLine, stopVerb } from '../board/boardModel'
import { useCountUp, usePageVisible, useReducedMotion } from '../cues/motion'
import { kindLabels, techniqueLabel } from '../labels'
import { opportunityLines } from '../night/closeModel'
import * as copy from '../night/nightCopy'
import { defensesFor, exposedOf, type NightStep } from '../night/nightModel'
import { SLICE_TURN, dossier, fileCard, parseSeed, randomSeed, aimsFor, answered, assetById, blockedBy, choicesFor, nightNow, sliceStart, verdictOf, type Aim, type Choice, type Verdict } from './sliceModel'
import { Theater, type Impact } from './theater'

// The defenses by a short name for a card; the formal name stays on the
// Dossier card and in what would have helped.
const SHORT: Record<CountermeasureId, string> = {
  antiJam: 'Anti-jam antennas',
  linkAuth: 'Link authentication',
  pntAuth: 'PNT authentication',
  sensorFusion: 'Sensor fusion',
  tierAAttestation: 'Firmware attestation',
  mlPipelineIntegrity: 'ML pipeline integrity',
  groundZeroTrust: 'Ground zero trust',
  insiderProgram: 'Insider program',
  ssaManeuver: 'SSA and maneuver fuel',
  encryptedBackhaul: 'Encrypted backhaul',
  irRetainer: 'Incident response retainer',
}

// The mark the bundle budget finds this chunk by (scripts/bundle-budget.mjs,
// the experiment chunk; tests/bundle-budget.json records the same string).
const EXPERIMENT = 'dc-3d-slice-experiment'

// From this width the cards stand in a column beside the theater; under
// it they are a sheet at the foot of the screen.
const WIDE = 1000

const VERDICT_WORD: Record<Verdict, string> = { blocked: 'BLOCKED', halved: 'HALVED', partial: 'PARTIAL', hit: 'HIT' }
const dots = (n: number) => '●'.repeat(n)
// A move's name on the world, where a chip has a tile's width: the deck's
// own short label for it (src/cues.ts); the cards keep the full name.
const chipName = (def: ThreatEvent) => EVENT_CUES[def.id]?.label ?? shortName(def)
const tenth = (n: number) => Math.round(n * 10) / 10
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`

type Stage = { at: 'fall' } | { at: 'launch'; i: number } | { at: 'choose'; i: number } | { at: 'land'; i: number } | { at: 'result'; i: number }
type Phase = 'plan' | 'night' | 'dawn'
interface Floater {
  id: number
  key: string
  text: string
  tone: Verdict
}

function seedFromUrl(): number | null {
  try {
    return parseSeed(new URLSearchParams(location.search).get('seed') ?? '')
  } catch {
    return null
  }
}

// Leaving the slice also leaves its address, so a reload from the title
// stays on the title.
function dropViewParam(): void {
  try {
    const url = new URL(location.href)
    if (!url.searchParams.has('view')) return
    url.searchParams.delete('view')
    url.searchParams.delete('seed')
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash)
  } catch {
    // The address stays; nothing else depends on it.
  }
}

const joined = (parts: readonly string[]) => parts.join('')

export default function Slice3D({ onBack, difficulty = 'easy' }: { onBack: () => void; difficulty?: Difficulty }) {
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const play = useSound()
  const [seed, setSeed] = useState(() => seedFromUrl() ?? randomSeed())
  const [run, setRun] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const game = useMemo(() => sliceStart(seed, difficulty), [seed, run])
  const [defense, setDefense] = useState<CountermeasureId | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('plan')
  const [stage, setStage] = useState<Stage>({ at: 'fall' })
  const [responses, setResponses] = useState<(string | null)[]>([])
  const [hud, setHud] = useState(() => ({ score: maiScore(game), credits: game.credits }))
  const [shown, setShown] = useState<GameState>(game)
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [filed, setFiled] = useState<{ n: number; total: number } | null>(null)
  const [openCard, setOpenCard] = useState(false)
  const [note, setNote] = useState('')
  const [say, setSay] = useState('')
  const [failed, setFailed] = useState(false)
  const [wide, setWide] = useState(() => typeof innerWidth === 'number' && innerWidth >= WIDE)

  const signs = useMemo(() => callSigns(game), [game])
  const aims = useMemo(() => aimsFor(game, defense), [game, defense])
  const now = useMemo(() => nightNow(game, defense, responses), [game, defense, responses])
  const nowRef = useRef(now)
  nowRef.current = now
  const responsesRef = useRef(responses)
  responsesRef.current = responses
  const intro = planFor(game, SLICE_TURN)?.intro ?? ''
  const defenseCost = defense ? (game.scenario.countermeasures.find((c) => c.id === defense)?.cost ?? 0) : 0

  useMusicState(shown)

  // ------------------------------------------------------------ the world

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const leaderRef = useRef<SVGLineElement | null>(null)
  const theater = useRef<Theater | null>(null)
  const tags = useRef(new Map<string, HTMLElement>())
  const anchor = useRef<string | null>(null)
  const wideRef = useRef(wide)
  wideRef.current = wide
  const dockAt = useRef({ x: 0, y: 0, set: false })

  const tagRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) tags.current.set(key, el)
      else tags.current.delete(key)
    },
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let t: Theater
    try {
      t = new Theater(
        canvas,
        (key, x, y, on) => {
          const el = tags.current.get(key)
          if (el) {
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
            el.style.visibility = on ? 'visible' : 'hidden'
          }
          if (key !== anchor.current) return
          // The card stands beside what it is about: on a wide screen it
          // floats next to the tile, on a phone a line ties the sheet to it.
          const dock = dockRef.current
          const line = leaderRef.current
          if (!dock) return
          const H = innerHeight
          if (wideRef.current) {
            // The card keeps its column and rides level with the tile.
            const dh = dock.offsetHeight
            const left = dock.offsetLeft
            const top = Math.max(84, Math.min(H - dh - 24, y - dh * 0.4))
            const at = dockAt.current
            at.y += (top - at.y) * (at.set ? 0.14 : 1)
            at.set = true
            dock.style.transform = `translate3d(0, ${at.y.toFixed(1)}px, 0)`
            if (line) {
              line.setAttribute('x1', `${x + 34}`)
              line.setAttribute('y1', `${y}`)
              line.setAttribute('x2', `${left - 6}`)
              line.setAttribute('y2', `${Math.max(at.y + 28, Math.min(at.y + dh - 28, y))}`)
              line.style.opacity = on && left - x > 70 ? '1' : '0'
            }
          } else if (line) {
            const top = dock.getBoundingClientRect().top
            line.setAttribute('x1', `${x}`)
            line.setAttribute('y1', `${y + 34}`)
            line.setAttribute('x2', `${x}`)
            line.setAttribute('y2', `${top}`)
            line.style.opacity = on && top - y > 60 ? '1' : '0'
          }
        },
        reduced,
      )
    } catch {
      setFailed(true)
      return
    }
    theater.current = t
    t.onTapEmpty = () => setSelected(null)
    const size = () => {
      t.resize()
      setWide(innerWidth >= WIDE)
    }
    const ro = new ResizeObserver(size)
    ro.observe(canvas)
    ;(window as unknown as { __dc3d?: unknown }).__dc3d = { stats: () => t.stats(), frame: () => t.renderOnce() }
    return () => {
      ro.disconnect()
      t.dispose()
      theater.current = null
      delete (window as unknown as { __dc3d?: unknown }).__dc3d
    }
    // The theater is built once; what changes is told to it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The app's CRT overlay and page scroll belong to the pixel game.
  useEffect(() => {
    document.documentElement.classList.add('t3-on')
    return () => document.documentElement.classList.remove('t3-on')
  }, [])

  useEffect(() => theater.current?.setRunning(visible), [visible, failed])
  useEffect(() => theater.current?.setReduced(reduced), [reduced])

  useEffect(() => {
    const t = theater.current
    if (!t) return
    t.setAssets(game.assets.map((a) => ({ id: a.id, kind: a.kind })))
    for (const a of game.assets) {
      t.setIntegrity(a.id, a.integrity)
      t.setJammed(a.id, false)
    }
  }, [game])

  // What is aimed, and what a defense already holds. Before the night it
  // is the engine's answer for the orders as they stand; in the night it
  // is the strikes still to come.
  const pending: Aim[] = useMemo(() => {
    if (phase === 'plan') return aims
    if (phase === 'dawn') return []
    const from = stage.at === 'fall' ? 0 : stage.at === 'launch' ? stage.i : stage.i + 1
    return aims.filter((a) => a.index >= from)
  }, [phase, stage, aims])

  const shielded = useRef(new Set<string>())
  useEffect(() => {
    const t = theater.current
    if (!t) return
    t.setAims(pending.filter((a) => a.targetId).map((a) => ({ key: `slot${a.index}`, targetId: a.targetId as string, blocked: a.exposed === 0 })))
    // A defense's shield stands on every tile it holds a move off tonight.
    const want = new Set(aims.filter((a) => a.exposed === 0 && a.targetId).map((a) => a.targetId as string))
    for (const id of want) if (!shielded.current.has(id)) t.setShield(id, 'defense')
    for (const id of shielded.current) if (!want.has(id)) t.setShield(id, null)
    shielded.current = want
  }, [pending, aims])

  // The card's anchor: the tile in hand before the night, the strike's
  // target in it.
  const step: NightStep | undefined = phase === 'night' && stage.at !== 'fall' ? now.night.steps[stage.i] : undefined
  const anchorId = phase === 'plan' ? selected : phase === 'night' && step && (stage.at === 'choose' || stage.at === 'result') ? (step.ev.targetAssetId ?? null) : null
  useLayoutEffect(() => {
    anchor.current = anchorId
    dockAt.current.set = false
    const dock = dockRef.current
    if (dock && (!anchorId || !wide)) dock.style.transform = ''
    if (leaderRef.current && !anchorId) leaderRef.current.style.opacity = '0'
  }, [anchorId, wide])

  useEffect(() => {
    if (phase === 'plan') theater.current?.setFocus(selected)
  }, [selected, phase])

  // The theater frames itself in what the chrome leaves clear.
  useLayoutEffect(() => {
    const dock = dockRef.current
    const top = topRef.current
    if (!dock || !top) return
    const tell = () => {
      const H = innerHeight || 1
      const clearTop = top.getBoundingClientRect().bottom / H
      // On a wide screen the cards keep a column on the right and the
      // theater has the rest.
      if (wide) theater.current?.setClear(clearTop, 0.97, 1 - (dock.offsetWidth + 72) / (innerWidth || 1))
      else theater.current?.setClear(clearTop, Math.max(0.42, Math.min(0.9, (H - dock.offsetHeight - 8) / H)), 1)
    }
    tell()
    const ro = new ResizeObserver(tell)
    ro.observe(dock)
    return () => ro.disconnect()
  }, [wide, failed])

  // --------------------------------------------------------------- orders

  const order = (id: CountermeasureId) => {
    if (phase !== 'plan') return
    const next = defense === id ? null : id
    const before = aimsFor(game, defense)
    const after = aimsFor(game, next)
    setDefense(next)
    play('buy-click')
    // COLDVEIL reacts to what is ordered: say so when a line swings.
    const moved = after.find((a) => before[a.index] && (before[a.index].def.id !== a.def.id || before[a.index].targetId !== a.targetId))
    if (next && moved) setNote(`COLDVEIL reroutes: ${shortName(moved.def)} on ${signs.get(moved.targetId ?? '') ?? 'the fleet'}. ${TONIGHT_REASON}`)
    else setNote('')
    const cm = game.scenario.countermeasures.find((c) => c.id === id)
    setSay(next ? `${cm?.name} ordered.` : `${cm?.name} cancelled.`)
  }

  useEffect(() => {
    if (phase === 'plan') setHud({ score: maiScore(game), credits: game.credits - defenseCost })
  }, [phase, game, defenseCost])

  const begin = () => {
    if (phase !== 'plan') return
    setSelected(null)
    setNote('')
    setResponses([])
    setStage({ at: 'fall' })
    setPhase('night')
    play('execute-sweep')
    setSay(copy.MOVING)
  }

  // ------------------------------------------------------------ the night

  const float = (key: string, text: string, tone: Verdict) => {
    const id = Date.now() + Math.random()
    setFloaters((f) => [...f, { id, key, text, tone }])
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2200)
  }

  useEffect(() => {
    if (phase !== 'night') return
    const t = theater.current
    if (!t) return
    let live = true
    const night = nowRef.current.night
    const go = async () => {
      if (stage.at === 'fall') {
        t.setFocus(null)
        t.setBeat('night')
        setShown(night.opening)
        await t.wait(reduced ? 0.7 : 1.5)
        if (live) setStage({ at: 'launch', i: 0 })
        return
      }
      const s = night.steps[stage.i]
      if (!s) {
        if (live) setPhase('dawn')
        return
      }
      const target = s.ev.targetAssetId
      if (stage.at === 'launch') {
        setFiled(null)
        setOpenCard(false)
        t.dropResponseShields()
        if (s.kind !== 'threat' || !target) {
          if (s.kind === 'opportunity') play(MOMENT_CUES.opportunity.sound)
          setShown(s.after)
          setHud({ score: s.scoreAfter, credits: s.after.credits })
          if (live) setStage({ at: 'result', i: stage.i })
          return
        }
        const asks = nowRef.current.open === stage.i
        const can = asks && choicesFor(game, defense, responsesRef.current, stage.i, s).some((c) => c.id !== null && c.fits)
        play(MOMENT_CUES['turn-start'].sound)
        setSay(`Incoming: ${shortName(s.def)} on ${signs.get(target) ?? 'the fleet'}.`)
        await t.launch(`slot${stage.i}`, target, can)
        if (!live) return
        if (can) setStage({ at: 'choose', i: stage.i })
        else if (asks) {
          // Tonight's one response is used, or the budget cannot meet one:
          // the move is ridden out, and the result says so.
          setResponses(answered(responsesRef.current, stage.i, null))
          setStage({ at: 'land', i: stage.i })
        } else setStage({ at: 'land', i: stage.i })
        return
      }
      if (stage.at === 'land' && target) {
        const ev = s.ev
        const verdict = verdictOf(ev)
        if (ev.response) {
          // The answer goes up as a shield of its own, for tonight.
          t.setShield(target, 'response')
          play('buy-click')
          setHud((h) => ({ ...h, credits: s.after.credits }))
          await t.wait(reduced ? 0.25 : 0.5)
          if (!live) return
        }
        const impact: Impact = verdict === 'blocked' ? 'blocked' : verdict === 'hit' ? 'hit' : 'halved'
        await t.land(impact)
        if (!live) return
        const delta = tenth(s.scoreAfter - s.scoreBefore)
        play(strikeSound(ev.eventId, ev.effectiveSeverity > 0), { intensity: strikeIntensity(ev.effectiveSeverity) })
        float(target, verdict === 'blocked' ? VERDICT_WORD.blocked : `${VERDICT_WORD[verdict]} ${delta.toFixed(1)}`, verdict)
        if (ev.integrityAfter !== undefined) t.setIntegrity(target, ev.integrityAfter)
        if (ev.condition) t.setJammed(target, true)
        setShown(s.after)
        setHud({ score: s.scoreAfter, credits: s.after.credits })
        setSay(verdict === 'blocked' ? copy.blockedSay(shortName(s.def), s.streak) : `${VERDICT_WORD[verdict]}: ${shortName(s.def)}. ${copy.scoreChange(delta)}.`)
        await t.wait(reduced ? 0.3 : 0.75)
        if (!live) return
        if (ev.condition) play(CONDITION_CUES[ev.eventId]?.sound ?? MOMENT_CUES.condition.sound)
        else if (verdict === 'blocked' && s.streak >= 2) play(MOMENT_CUES.streak.sound)
        setStage({ at: 'result', i: stage.i })
      }
    }
    void go()
    return () => {
      live = false
    }
    // Each stage runs once, on the night as it stood when the stage began.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage])

  const respond = (id: string | null) => {
    if (phase !== 'night' || stage.at !== 'choose') return
    setResponses(answered(responses, stage.i, id))
    setStage({ at: 'land', i: stage.i })
  }

  const onward = (collect: boolean) => {
    if (phase !== 'night' || stage.at !== 'result' || filed) return
    const i = stage.i
    const next = () => {
      if (i + 1 < nowRef.current.night.steps.length) setStage({ at: 'launch', i: i + 1 })
      else setPhase('dawn')
    }
    if (collect && step) {
      fileCard(step.def.id)
      play(MOMENT_CUES.file.sound)
      setFiled({ n: dossier().size, total: THREAT_EVENT_COUNT })
      setSay(copy.filedCount(dossier().size, THREAT_EVENT_COUNT))
      window.setTimeout(next, reduced ? 350 : 700)
    } else next()
  }

  // ------------------------------------------------------------- the dawn

  useEffect(() => {
    if (phase !== 'dawn') return
    const t = theater.current
    const { night, after } = nowRef.current
    t?.dropResponseShields()
    t?.setFocus(null)
    t?.setBeat('dawn')
    setShown(after)
    for (const a of after.assets) t?.setIntegrity(a.id, a.integrity)
    const id = window.setTimeout(
      () => {
        setHud({ score: night.record.maiScore, credits: night.record.creditsAfter })
        play(MOMENT_CUES['end-of-turn'].sound)
      },
      reduced ? 200 : 900,
    )
    setSay(`Dawn. Score ${night.record.maiScore.toFixed(1)}.`)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const again = () => {
    const t = theater.current
    setDefense(null)
    setSelected(null)
    setResponses([])
    setFloaters([])
    setFiled(null)
    setNote('')
    setStage({ at: 'fall' })
    setPhase('plan')
    setSeed(randomSeed())
    setRun((n) => n + 1)
    t?.setBeat('wide')
    for (const id of shielded.current) t?.setShield(id, null)
    shielded.current = new Set()
  }
  useEffect(() => setShown(game), [game])

  const leave = () => {
    dropViewParam()
    onBack()
  }

  // Each card puts the way on under the thumb and in focus.
  const primary = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (phase === 'night' && (stage.at === 'choose' || stage.at === 'result')) primary.current?.focus({ preventScroll: true })
    if (phase === 'dawn') primary.current?.focus({ preventScroll: true })
  }, [phase, stage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ----------------------------------------------------------------- view

  const score = useCountUp(hud.score, reduced, 700)
  const credits = useCountUp(hud.credits, reduced, 500)
  const boardState = phase === 'plan' ? game : shown
  const dawnDelta = tenth(now.night.record.maiScore - maiScore(game))
  const threatCount = now.night.steps.filter((s) => s.kind === 'threat').length
  const phaseLine =
    phase === 'plan' ? 'BEFORE THE NIGHT' : phase === 'dawn' ? 'DAWN' : stage.at === 'fall' ? copy.MOVING : step?.kind === 'threat' ? `STRIKE ${now.night.steps.filter((s) => s.kind === 'threat' && s.index <= stage.i).length} OF ${threatCount}` : 'THE NIGHT'

  if (failed) {
    return (
      <div className="t3-root t3-failed">
        <p>This device could not start the 3D view.</p>
        <button type="button" className="t3-btn" onClick={leave}>
          BACK TO TITLE
        </button>
      </div>
    )
  }

  const selectedAsset = assetById(boardState, selected ?? undefined)
  const aimsOn = (id: string) => pending.filter((a) => a.targetId === id)

  return (
    <div ref={rootRef} className={`t3-root${wide ? ' t3-wide' : ''}`} data-experiment={EXPERIMENT} data-t3-phase={phase} data-t3-stage={phase === 'night' ? stage.at : phase} data-t3-step={phase === 'night' && stage.at !== 'fall' ? stage.i : undefined} data-reduced={reduced || undefined}>
      <canvas ref={canvasRef} className="t3-canvas" role="img" aria-label="Orbital view: the STORMGLASS-9 satellites, the KESTREL drones and the ground station over the area of operations, with COLDVEIL off the night side. Drag to look around." />

      <svg className="t3-leader" aria-hidden="true">
        <line ref={leaderRef} x1="0" y1="0" x2="0" y2="0" />
      </svg>

      {/* The world's own labels: each tile is a button on the tile. */}
      <div className="t3-tags">
        <div ref={tagRef('coldveil')} className="t3-tag t3-tag-foe" aria-hidden="true">
          <span>COLDVEIL</span>
        </div>
        <div ref={tagRef('score')} className="t3-tag t3-tag-score" aria-hidden="true">
          {phase === 'dawn' && (
            <p className="t3-worldscore" data-t3-final>
              <span>MISSION ASSURANCE</span>
              <b>{score.toFixed(1)}</b>
              <i className={dawnDelta < -0.05 ? 't3-bad' : 't3-ok'}>{Math.abs(dawnDelta) < 0.05 ? 'held through the night' : `${signed(dawnDelta)} tonight`}</i>
            </p>
          )}
        </div>
        <div ref={tagRef('comet')} className="t3-tag t3-tag-comet" aria-hidden="true">
          {phase === 'night' && step?.kind === 'threat' && (stage.at === 'launch' || stage.at === 'choose') && (
            <span>
              {chipName(step.def)} {dots(step.ev.baseSeverity + step.ev.chainBonus)}
            </span>
          )}
        </div>
        {game.assets.map((a) => {
          const asset = assetById(boardState, a.id) ?? a
          const sign = signs.get(a.id) ?? a.id
          const on = aimsOn(a.id)
          const hurt = asset.integrity < 100
          const label = `${sign}, ${kindLabels[a.kind]}, integrity ${asset.integrity}%${on.length ? `. Aimed here: ${on.map((x) => `${shortName(x.def)}, strength ${x.strength}${x.exposed === 0 ? ', your shield stops it' : ''}`).join('; ')}` : ''}`
          return (
            <div key={a.id} ref={tagRef(a.id)} className="t3-tag">
              <button
                type="button"
                data-t3-asset={a.id}
                data-t3-kind={a.kind}
                data-t3-sign={sign}
                aria-label={label}
                aria-pressed={selected === a.id}
                disabled={phase !== 'plan'}
                className={`t3-asset${selected === a.id ? ' is-on' : ''}${on.some((x) => x.exposed > 0) ? ' is-aimed' : ''}${on.length && on.every((x) => x.exposed === 0) ? ' is-held' : ''}`}
                onClick={() => {
                  setSelected(selected === a.id ? null : a.id)
                  play('soft-tick')
                }}
              >
                <span className="t3-threats">
                  {phase !== 'dawn' &&
                    on.map((x) => (
                      <span key={x.index} className={`t3-chip ${x.exposed === 0 ? 't3-chip-held' : 't3-chip-foe'}`}>
                        {chipName(x.def)} <i>{dots(x.strength)}</i>
                      </span>
                    ))}
                </span>
                <span className="t3-sign">
                  {sign}
                  <span className={`t3-bar${hurt ? ' is-hurt' : ''}`}>
                    <i style={{ width: `${asset.integrity}%` }} />
                  </span>
                  {phase === 'dawn' && hurt && <b>{asset.integrity}%</b>}
                </span>
              </button>
              {floaters
                .filter((f) => f.key === a.id)
                .map((f) => (
                  <span key={f.id} className={`t3-float t3-${f.tone}`} aria-hidden="true">
                    {f.text}
                  </span>
                ))}
            </div>
          )
        })}
      </div>

      <div ref={topRef} className="t3-top">
        <button type="button" className="t3-round" data-t3-back aria-label="Back to title" onClick={leave}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="t3-where">
          <b>ONE NIGHT</b>
          <span data-t3-phaseline>{phaseLine}</span>
        </div>
        <div className="t3-meters">
          <div className={`t3-meter${phase === 'dawn' ? ' is-big' : ''}`} data-t3-score aria-label={`Mission assurance score ${hud.score.toFixed(1)}. The win line is ${game.scenario.winThreshold}.`}>
            <span>SCORE</span>
            <b>{score.toFixed(1)}</b>
            <span className="t3-line" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
              <u style={{ left: `${game.scenario.winThreshold}%` }} />
            </span>
          </div>
          <div className="t3-meter" data-t3-budget aria-label={`Budget ${hud.credits} CR`}>
            <span>BUDGET</span>
            <b>
              {Math.round(credits)}
              <small> CR</small>
            </b>
          </div>
        </div>
      </div>

      <p className="t3-sr" role="status" aria-live="polite">
        {say}
      </p>

      <div ref={dockRef} className={`t3-dock${anchorId && wide ? ' is-anchored' : ''}`} data-t3-dock>
        {phase === 'plan' && !selectedAsset && (
          <div className="t3-card" key="brief">
            <p className="t3-eyebrow">WATCH OFFICER · TONIGHT</p>
            <p className="t3-lead">{intro}</p>
            <ul className="t3-moves">
              {aims.map((a) => (
                <li key={a.index}>
                  <button type="button" data-t3-move={a.def.id} className="t3-move" onClick={() => a.targetId && setSelected(a.targetId)}>
                    <span className={a.exposed === 0 ? 't3-held-dot' : 't3-foe-dot'} aria-hidden="true" />
                    <span>
                      <b>{chipName(a.def)}</b> <i>{dots(a.strength)}</i>
                      <small>
                        on {signs.get(a.targetId ?? '') ?? 'the fleet'} · {a.exposed === 0 ? 'your shield stops it' : `strength ${a.exposed} gets through`}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {note ? <p className="t3-note">{note}</p> : <p className="t3-hint">Tap a target to order a defense. Drag to look around.</p>}
          </div>
        )}

        {phase === 'plan' && selectedAsset && (
          <div className="t3-card" key={`asset-${selectedAsset.id}`} data-t3-card="asset">
            <div className="t3-head">
              <div>
                <p className="t3-eyebrow">{kindLabels[selectedAsset.kind].toUpperCase()}</p>
                <h2 className="t3-title">
                  {signs.get(selectedAsset.id)} <small>integrity {selectedAsset.integrity}%</small>
                </h2>
              </div>
              <button type="button" className="t3-round t3-small" aria-label="Close" onClick={() => setSelected(null)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {aimsOn(selectedAsset.id).length === 0 && <p className="t3-quiet">Nothing is aimed here tonight.</p>}
            {aimsOn(selectedAsset.id).map((a) => (
              <div key={a.index} className="t3-threat">
                <p className="t3-incoming">
                  <span className={a.exposed === 0 ? 't3-ok' : 't3-bad'}>{a.exposed === 0 ? 'SHIELDED' : 'INCOMING'}</span>
                  <b>{shortName(a.def)}</b> <i>{dots(a.strength)}</i>
                </p>
                <p className="t3-hook">{copy.HOOK[a.def.id] ?? a.def.name}.</p>
                {a.answers.map(({ cm, verb, ordered }) => {
                  const locked = !ordered && defense !== null
                  // What COLDVEIL does about it: the engine's own answer
                  // for this track with this defense ordered.
                  const then = aimsFor(game, cm.id)[a.index]
                  const dodge = then && then.exposed > 0 ? then : null
                  const does = dodge ? `${verb === 'stops' ? 'Stops' : 'Blunts'} it, then COLDVEIL switches to ${chipName(dodge.def)}` : verb === 'stops' ? 'Stops this track, every night' : 'Blunts it, every night'
                  return (
                    <button
                      key={cm.id}
                      type="button"
                      data-t3-order={cm.id}
                      aria-pressed={ordered}
                      aria-label={`${cm.name}. ${cm.cost} CR. ${does}.${ordered ? ' Ordered. Tap to cancel.' : locked ? ' Replaces tonight’s order.' : ''}`}
                      className={`t3-choice t3-defense${ordered ? ' is-on' : ''}`}
                      onClick={() => order(cm.id)}
                    >
                      <span className="t3-choice-top">
                        <b>{SHORT[cm.id]}</b>
                        <span>{cm.cost} CR</span>
                      </span>
                      <span className={`t3-choice-sub ${dodge ? 't3-warn' : 't3-ok'}`}>{ordered ? (dodge ? `ORDERED · COLDVEIL switched to ${chipName(dodge.def)} · tap to cancel` : 'ORDERED · shield up · tap to cancel') : `${does}${locked ? ' · replaces tonight’s order' : ''}`}</span>
                    </button>
                  )
                })}
              </div>
            ))}
            {note && <p className="t3-note">{note}</p>}
          </div>
        )}

        {phase === 'plan' && (
          <div className="t3-go">
            <p data-t3-order-line>{defense ? `${SHORT[defense]} ordered · 1 new defense a night` : '1 new defense and 1 response a night'}</p>
            <button type="button" data-t3-begin className="t3-btn t3-primary" onClick={begin}>
              BEGIN THE NIGHT
            </button>
          </div>
        )}

        {phase === 'night' && stage.at === 'fall' && (
          <div className="t3-card t3-banner" key="fall">
            <p className="t3-eyebrow t3-bad">{copy.MOVING}</p>
            <p className="t3-lead">Night falls over the area of operations.</p>
          </div>
        )}

        {phase === 'night' && step && (stage.at === 'launch' || stage.at === 'land') && step.kind === 'threat' && (
          <div className="t3-card t3-banner" key={`in-${stage.i}`}>
            <p className="t3-eyebrow t3-bad">{copy.incomingHeader(game.turn).split(' · ')[0]}</p>
            <p className="t3-lead">
              <b>{shortName(step.def)}</b> on {signs.get(step.ev.targetAssetId ?? '') ?? 'the fleet'}
            </p>
            {stage.at === 'land' && step.ev.room !== undefined && !step.ev.response && (step.ev.answered ?? 0) > 0 && <p className="t3-hint">{copy.ALREADY_ANSWERED}.</p>}
          </div>
        )}

        {phase === 'night' && stage.at === 'choose' && step && <ChoiceCard step={step} choices={choicesFor(game, defense, responses, stage.i, step)} sign={signs.get(step.ev.targetAssetId ?? '') ?? ''} credits={step.before.credits} first={primary} onRespond={respond} />}

        {phase === 'night' && stage.at === 'result' && step && (
          <ResultCard
            step={step}
            sign={signs.get(step.ev.targetAssetId ?? '') ?? ''}
            signs={signs}
            fresh={!filed && !dossier().has(step.def.id)}
            filed={filed}
            open={openCard}
            onOpen={() => setOpenCard((o) => !o)}
            last={stage.i + 1 >= now.night.steps.length}
            first={primary}
            could={step.ev.response || step.ev.room === undefined ? undefined : choicesFor(game, defense, responses, stage.i, step).find((c) => c.id !== null && c.fits)}
            onContinue={onward}
          />
        )}

        {phase === 'dawn' && <DawnCard game={game} now={now} defense={defense} first={primary} onAgain={again} onBack={leave} />}
      </div>
    </div>
  )
}

// THE RESPONSE, BESIDE ITS TARGET. The strike holds short of the tile
// while these stand: each answer in the content's own words, with its
// cost and what the engine says it does.
function ChoiceCard({ step, choices, sign, credits, first, onRespond }: { step: NightStep; choices: Choice[]; sign: string; credits: number; first: RefObject<HTMLButtonElement | null>; onRespond: (id: string | null) => void }) {
  const { ev, def } = step
  const strength = ev.baseSeverity + ev.chainBonus
  const exposed = exposedOf(ev)
  const { held } = defensesFor(def, step.before.counters, step.before.scenario)
  return (
    <div className="t3-card" key={`choose-${step.index}`} data-t3-card="respond">
      <p className="t3-eyebrow t3-bad">
        INCOMING · {sign} <span className="t3-right">{copy.ONE_A_NIGHT}</span>
      </p>
      <h2 className="t3-title">
        {shortName(def)} <i className="t3-bad">{dots(strength)}</i>
      </h2>
      <p className="t3-hook">{copy.exposedLine(strength, exposed, held?.name)}</p>
      <div role="group" aria-label={copy.YOUR_RESPONSE} className="t3-choices">
        {choices.map((c, k) => {
          const label = c.id ? (RESPONSE_TEXT[def.id]?.[c.id] ?? c.id) : copy.RIDE_IT_OUT
          const effect = c.fits ? copy.effectLine(c.effect, c.score, c.repair) : copy.EFFECT_WORD[c.effect]
          const why = c.fits ? '' : c.why === 'used' ? copy.ALREADY_ANSWERED : 'Not enough budget tonight'
          const cost = c.id ? copy.crFace(c.cost) : copy.FREE
          return (
            <button
              key={c.id ?? 'ride'}
              ref={k === 0 ? first : undefined}
              type="button"
              data-t3-response={c.id ?? 'ride'}
              data-effect={c.effect}
              disabled={!c.fits}
              aria-label={`${label}. ${cost}. ${why || effect}.`}
              className={`t3-choice t3-${c.effect}`}
              onClick={() => onRespond(c.id)}
            >
              <span className="t3-choice-top">
                <b>{label}</b>
                <span>{cost}</span>
              </span>
              <span className="t3-choice-sub">{why || effect}</span>
            </button>
          )
        })}
      </div>
      <p className="t3-foot" data-t3-response-budget>
        {copy.budgetNow(credits)}
      </p>
    </div>
  )
}

// THE RESULT, IN PLACE: what the strike did, what the player did about it,
// what would have helped, and the Dossier card's headline with the whole
// card one tap away.
function ResultCard({
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
  onContinue,
}: {
  step: NightStep
  sign: string
  signs: Map<string, string>
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
  if (step.kind !== 'threat') {
    return (
      <div className="t3-card" key={`res-${step.index}`} data-t3-card="windfall">
        <p className="t3-eyebrow t3-ok">GOOD NEWS</p>
        <h2 className="t3-title">{shortName(def)}</h2>
        {opportunityLines(step, signs).map((l) => (
          <p key={l} className="t3-hook">
            {l}
          </p>
        ))}
        <button ref={first} type="button" data-t3-continue className="t3-btn t3-primary" onClick={() => onContinue(false)}>
          {last ? 'SEE THE DAWN' : copy.CONTINUE}
        </button>
      </div>
    )
  }
  const verdict = verdictOf(ev)
  const delta = tenth(step.scoreAfter - step.scoreBefore)
  const scenario = step.after.scenario
  const { held, missing, partner } = defensesFor(def, step.after.counters, scenario)
  const ref = def.techniqueRefs[0]
  const source = def.learnMoreCards[0]?.sources[0]
  const stopped = stoppedByLine(def, scenario)
  const officer = copy.officerFor(step, sign || undefined)
  const helped = missing ? joined(ev.response ? copy.lastingAnswer(missing.name, missing.cost) : held ? copy.finishedIt(missing.name, missing.cost) : copy.wouldHaveHelped(missing.name, missing.cost)) : ''
  const stops = missing && !held ? ` It ${stopVerb(missing.id, def) === 'stops' ? 'stops' : 'blunts'} ${shortName(def)} every night.` : ''
  return (
    <div className={`t3-card t3-result-${verdict}`} key={`res-${step.index}`} data-t3-card="result" data-t3-verdict={verdict}>
      <div className="t3-verdict">
        <b className={`t3-${verdict}`}>{VERDICT_WORD[verdict]}</b>
        <span>
          {shortName(def)} on {sign}
        </span>
        <span className="t3-right" data-t3-delta>
          {copy.scoreChange(delta)}
        </span>
      </div>
      <p className="t3-tagsline">
        {ev.response ? (
          <span data-t3-took={ev.response.id}>{copy.youDid(RESPONSE_TEXT[def.id]?.[ev.response.id] ?? ev.response.id, ev.response.cost)}</span>
        ) : ev.room !== undefined ? (
          <span data-t3-took="ride">{copy.RODE_OUT}</span>
        ) : null}
        {ev.repairCost > 0 && <span>{copy.repairTag(ev.repairCost, ev.integrityAfter !== undefined)}</span>}
        {ev.condition && <span className="t3-warn">{copy.conditionTag(ev.condition.name, Math.max(0, ev.condition.turns - 1))}</span>}
        {verdict === 'blocked' && step.streak >= 2 && <span className="t3-ok">{copy.streakLine(step.streak)}</span>}
      </p>
      {/* What would have helped, and what the player can now say. */}
      <p className="t3-helped" data-t3-helped>
        {verdict === 'blocked' && blockedBy(ev) === 'defense' && held
          ? joined(partner ? copy.canNowSayWith(held.name, shortName(def), partner.name) : copy.canNowSay(held.name, shortName(def)))
          : `${ev.response ? `${copy.TONIGHT_ONLY} ` : ''}${helped}${stops}${could && could.id ? ` ${joined(copy.couldHave(RESPONSE_TEXT[def.id]?.[could.id] ?? could.id, could.cost))}` : ''}`}
      </p>
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
            {officer && (
              <p className="t3-officer">
                <span>{copy.officerLabel(officer.clock)}</span> {officer.line}
              </p>
            )}
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
      {filed ? (
        <p className="t3-stamp" role="status" data-t3-filed>
          {copy.filedCount(filed.n, filed.total)}
        </p>
      ) : fresh ? (
        <button ref={first} type="button" data-t3-file className="t3-btn t3-primary" onClick={() => onContinue(true)}>
          {copy.FILE_TO_DOSSIER}
        </button>
      ) : (
        <button ref={first} type="button" data-t3-continue className="t3-btn t3-primary" onClick={() => onContinue(false)}>
          {last ? 'SEE THE DAWN' : 'NEXT STRIKE'}
        </button>
      )}
    </div>
  )
}

// THE DAWN: the turn's close, with the score's change large and the
// budget's in one line, and what to fix.
function DawnCard({ game, now, defense, first, onAgain, onBack }: { game: GameState; now: ReturnType<typeof nightNow>; defense: CountermeasureId | null; first: RefObject<HTMLButtonElement | null>; onAgain: () => void; onBack: () => void }) {
  const { night, after } = now
  const rec = night.record
  const from = maiScore(game)
  const to = rec.maiScore
  const threats = night.steps.filter((s) => s.kind === 'threat')
  const stopped = threats.filter((s) => s.ev.effectiveSeverity === 0).length
  const l = rec.ledger
  const worst = threats.filter((s) => s.ev.effectiveSeverity > 0).sort((a, b) => a.scoreAfter - a.scoreBefore - (b.scoreAfter - b.scoreBefore))[0]
  const missing = worst ? defensesFor(worst.def, after.counters, after.scenario).missing : undefined
  const fix = !worst ? copy.NOTHING_THROUGH : missing ? joined(copy.fixDefense(missing.name, missing.cost, shortName(worst.def), stopVerb(missing.id, worst.def) === 'stops' ? 'stops' : 'blunts')) : copy.fixRespond(shortName(worst.def))
  const parts = [
    defense && l.ordered ? `Defense -${l.ordered}` : '',
    l.responses ? `Response -${l.responses}` : '',
    l.windfall ? `Windfall +${l.windfall}` : '',
    l.repairs ? `Repairs -${l.repairs}` : '',
    l.upkeep ? `Upkeep -${l.upkeep}` : '',
    l.funding + l.coverageBonus ? `Funding +${l.funding + l.coverageBonus}` : '',
  ].filter(Boolean)
  return (
    <div className="t3-card t3-dawn" key="dawn" data-t3-card="dawn">
      <p className={`t3-eyebrow ${stopped === threats.length ? 't3-ok' : 't3-warn'}`}>DAWN · {stopped === threats.length ? 'A CLEAN NIGHT' : `${stopped} OF ${threats.length} STOPPED`}</p>
      <p className="t3-ledger" data-t3-scoreline>
        Score {from.toFixed(1)} → {to.toFixed(1)}
        <small>{Math.abs(to - from) < 0.05 ? 'Held through the night.' : `${signed(tenth(to - from))} tonight. The win line is ${game.scenario.winThreshold}.`}</small>
      </p>
      <p className="t3-helped">
        {worst ? <span className="t3-warn">{copy.FIX_LABEL} </span> : null}
        {fix}
      </p>
      <p className="t3-ledger" data-t3-ledger>
        Budget {l.start} CR → {l.after} CR<small>{parts.join(' · ')}</small>
      </p>
      <div className="t3-row">
        <button ref={first} type="button" data-t3-again className="t3-btn t3-primary" onClick={onAgain}>
          PLAY ANOTHER NIGHT
        </button>
        <button type="button" data-t3-exit className="t3-btn" onClick={onBack}>
          BACK TO TITLE
        </button>
      </div>
      <p className="t3-foot">An experiment: 1 night of the 6 in a full operation. The whole game is on the title screen.</p>
    </div>
  )
}
