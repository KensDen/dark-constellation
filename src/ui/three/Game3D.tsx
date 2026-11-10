// THE 3D GAME (v2.0 R1): Dark Constellation's whole six-turn operation
// played in a world, with the player's hands on it. The engine, the
// content and the night's words are the game's own; the presentation is
// new. Reached from the title's PLAY, CONTINUE and DAILY OP, in a deferred
// chunk of its own; the pixel board stays at ?view=classic.
//
// A turn: BEFORE THE NIGHT the player scans the theater (tap a signature
// or drag the scan lens over it), places one defense on an asset (drag the
// piece, or tap it), may order assets, and begins the night. IN THE NIGHT
// each strike flies in with its own look and sound; one that would land
// holds short while the answers stand beside it (drag one onto the target,
// reroute its link, isolate it, or let it ride), then a ring closes on the
// target and a well-timed tap takes a little off. AT DAWN the turn closes.
// After night 6, the debrief, the after-action replay and the Dossier.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './game3d.css'
import { strikeIntensity, useMusicState, useSound } from '../../audio'
import { THREAT_EVENT_COUNT } from '../../content'
import { RESPONSE_TEXT } from '../../content/responseText'
import { CONDITION_CUES, MOMENT_CUES, outcomeSound, strikeSound } from '../../cues'
import { planFor } from '../../engine/campaign'
import { defenseBonus } from '../../engine/learning'
import { maiScore } from '../../engine/scoring'
import type { AssetKind, CountermeasureId, DebrisChoice, GameState, TimingGrade } from '../../engine/types'
import { LocalDailyLedger, LocalScoreSink, LocalStorageStore, addRunTime, beginRun, dossier, fileCard, recordMet, recordNamed, runKey, type DailyOp, type DailyStanding, type RestoredGame } from '../../persistence'
import { callSigns, cartCallSigns } from '../board/board'
import { TONIGHT_REASON, shortName } from '../board/boardModel'
import { useCountUp, usePageVisible, useReducedMotion } from '../cues/motion'
import { hasSeenIntro, markIntroSeen } from '../introSeen'
import { kindLabels } from '../labels'
import { callTerms } from '../night/closeModel'
import * as copy from '../night/nightCopy'
import type { Night, NightStep } from '../night/nightModel'
import { deviceDifficulty, newOperation } from '../session'
import { AssetCard, CallCard, ChoiceCard, ContactCard, DawnCard, FleetCard, PieceCard, ResultCard, StrikeBanner, Tray, VERDICT_WORD, dots, type AnswerView } from './cards3d'
import * as c3 from './copy3d'
import {
  ASSIST_GRADE,
  NO_INPUTS,
  NO_ORDERS,
  PIECE,
  assetById,
  canScan,
  chainArmed,
  choicesFor,
  conditionsOn,
  contactsFor,
  defenseDef,
  fleetFor,
  gradeTap,
  kitFor,
  nightNow,
  scanState,
  stakesFor,
  verdictOf,
  withResponse,
  withTiming,
  type Contact,
  type NightInputs,
  type Orders,
  type Verdict,
} from './gameModel'
import { SignatureGlyph } from './glyphs'
import { Opening } from './opening3d'
import { Debrief, DossierRoom, ReplayDock, SystemSheet } from './rooms3d'
import { playMotif } from './sounds3d'
import { clearNight, logNight, markNight, nightMark, placements, prefs as readPrefs, progress, recordFinish, setPlacements, setPrefs, unlocksFor, type Placements, type Prefs } from './store3d'
import type { Impact } from './theater'
import { World } from './world'

// The mark the bundle budget finds this chunk by (scripts/bundle-budget.mjs;
// tests/bundle-budget.json records the same string).
const CHUNK_MARK = 'dc-3d-game-chunk'

// From this width the cards stand in a column beside the theater; under
// it they are a sheet at the foot of the screen.
const WIDE = 1000

const tenth = (n: number) => Math.round(n * 10) / 10
const JAMS = new Set(['pnt-jamming', 'uplink-jamming'])

type Stage =
  | { at: 'fall' }
  | { at: 'launch'; i: number }
  | { at: 'choose'; i: number }
  | { at: 'call'; i: number }
  | { at: 'land'; i: number }
  | { at: 'impact'; i: number }
  | { at: 'result'; i: number }
type Phase = 'opening' | 'plan' | 'night' | 'dawn' | 'debrief' | 'replay'
type Sel = { kind: 'contact'; id: string } | { kind: 'asset'; id: string } | { kind: 'piece'; id: CountermeasureId } | { kind: 'fleet' } | null
type GuideStep = keyof typeof c3.GUIDE | null
interface Floater {
  id: number
  key: string
  text: string
  tone: Verdict | 'timed'
}
// Something in the hand: a defense piece, the scan lens, an answer, a link
// being rerouted, or a satellite being burned off its orbit.
interface Drag {
  kind: 'piece' | 'scan' | 'response' | 'link' | 'burn'
  id: string
  label: string
  x: number
  y: number
  fromX: number
  fromY: number
  over: string | null
}

const saveStore = new LocalStorageStore()
const scoreSink = new LocalScoreSink()
const dailyLedger = new LocalDailyLedger()

// A game opened from an address with a seed in it (?view=3d&seed=n) drops
// the seed from the address once it is running, so a reload resumes the
// game from its autosave and does not start the seed again; leaving for
// the title leaves a plain address too.
function dropViewParam(): void {
  try {
    const url = new URL(location.href)
    if (url.searchParams.get('view') !== '3d' && !url.searchParams.has('seed')) return
    if (url.searchParams.get('view') === '3d') url.searchParams.delete('view')
    url.searchParams.delete('seed')
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash)
  } catch {
    // The address stays; nothing else depends on it.
  }
}

// The game a mount begins with: the one handed in, or a new operation; a
// fresh free-play game takes the posture the player chose, once unlocked.
function arrive(initial: RestoredGame | null): { state: GameState; daily?: DailyOp } {
  const op = initial ?? newOperation(deviceDifficulty())
  let state = op.state
  const fresh = state.status === 'playing' && state.turn === 1 && state.history.length === 0
  if (fresh && !op.daily && !state.posture && readPrefs().posture === 'dark' && unlocksFor(progress(), dossier().size).postures.dark) state = { ...state, posture: 'dark' }
  return { state, daily: op.daily }
}

export interface Game3DProps {
  initial: RestoredGame | null
  // 'dossier' opens the Dossier alone, from the title; 'briefing' replays
  // the opening and returns.
  mode?: 'play' | 'dossier' | 'briefing'
  onExit: () => void
}

export default function Game3D({ initial, mode = 'play', onExit }: Game3DProps) {
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const play = useSound()
  const [start] = useState(() => arrive(initial))
  const [game, setGame] = useState<GameState>(start.state)
  const [daily, setDaily] = useState<DailyOp | undefined>(start.daily)
  const [standing, setStanding] = useState<DailyStanding | null>(null)
  const [pf, setPf] = useState<Prefs>(() => readPrefs())
  const [phase, setPhase] = useState<Phase>(() => {
    if (mode === 'briefing') return 'opening'
    if (start.state.status !== 'playing') return 'debrief'
    return start.state.history.length === 0 && !hasSeenIntro() ? 'opening' : 'plan'
  })
  const [orders, setOrders] = useState<Orders>(NO_ORDERS)
  const [inputs, setInputs] = useState<NightInputs>(NO_INPUTS)
  const [stage, setStage] = useState<Stage>({ at: 'fall' })
  const [sel, setSel] = useState<Sel>(null)
  const run = runKey(game.seed, game.difficulty, daily?.dateKey)
  const [placed, setPlaced] = useState<Placements>(() => placements(runKey(start.state.seed, start.state.difficulty, start.daily?.dateKey)))
  const [hud, setHud] = useState(() => ({ score: start.state.history.length ? start.state.history[start.state.history.length - 1].maiScore : maiScore(start.state), credits: start.state.credits }))
  const [shown, setShown] = useState<GameState>(start.state)
  const [last, setLast] = useState<{ before: GameState; night: Night; after: GameState } | null>(null)
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [filed, setFiled] = useState<{ n: number; total: number } | null>(null)
  const [openCard, setOpenCard] = useState(false)
  const [note, setNote] = useState('')
  const [say, setSay] = useState('')
  const [failed, setFailed] = useState(false)
  const [wide, setWide] = useState(() => typeof innerWidth === 'number' && innerWidth >= WIDE)
  const [sheet, setSheet] = useState(false)
  const [room, setRoom] = useState<{ focus?: string } | null>(null)
  const [earned, setEarned] = useState<string[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  const [dwell, setDwell] = useState<string | null>(null)
  const [tapOpen, setTapOpen] = useState(false)
  // BEGIN asked once more on a night whose WORST CASE is below 0.
  const [atRisk, setAtRisk] = useState(false)
  const [guide, setGuide] = useState<GuideStep>(() => (mode === 'play' && !readPrefs().guideSeen && start.state.status === 'playing' && start.state.history.length === 0 ? 'scan' : null))
  // Whether this game's finish has been recorded. True from the start for
  // a game that arrived finished: it was not played here.
  const recorded = useRef(start.state.status !== 'playing')
  const assist = pf.assist || reduced

  const totalTurns = game.scenario.totalTurns
  const deciding = phase === 'plan' && game.status === 'playing'
  const signs = useMemo(() => callSigns(game), [game])
  const cartSigns = useMemo(() => cartCallSigns(game, orders.assets.map((kind) => ({ kind }))), [game, orders.assets])
  const contacts = useMemo(() => (deciding ? contactsFor(game, orders) : []), [deciding, game, orders])
  const kit = useMemo(() => (deciding ? kitFor(game, orders, contacts) : []), [deciding, game, orders, contacts])
  const fleet = useMemo(() => (deciding ? fleetFor(game, orders) : []), [deciding, game, orders])
  const scan = scanState(game, orders)
  const stakes = useMemo(() => (deciding ? stakesFor(game, orders, contacts, maiScore(game)) : null), [deciding, game, orders, contacts])
  const now = useMemo(() => (phase === 'night' ? nightNow(game, orders, inputs) : null), [phase, game, orders, inputs])
  const nowRef = useRef(now)
  nowRef.current = now
  const inputsRef = useRef(inputs)
  inputsRef.current = inputs
  const ordersRef = useRef(orders)
  ordersRef.current = orders
  const gameRef = useRef(game)
  gameRef.current = game
  const intro = planFor(game, game.turn)?.intro ?? ''
  const tracks = useMemo(() => new Set(contacts.map((c) => c.slot)).size, [contacts])

  useMusicState(phase === 'opening' ? null : shown)

  // ------------------------------------------------------------ the world

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const leaderRef = useRef<SVGLineElement | null>(null)
  const dragLine = useRef<SVGLineElement | null>(null)
  const world = useRef<World | null>(null)
  const tags = useRef(new Map<string, HTMLElement>())
  const at = useRef(new Map<string, { x: number; y: number; on: boolean }>())
  const anchor = useRef<string | null>(null)
  const wideRef = useRef(wide)
  wideRef.current = wide
  const dockAt = useRef({ y: 0, set: false })
  const frameNo = useRef(0)
  // Each asset's signatures are tied to it by a line, so a block of them
  // set aside from a crowded spot still reads as that asset's.
  const ties = useRef(new Map<string, SVGLineElement>())
  const chipAt = useRef(new Map<string, { dx: number; dy: number; w: number; h: number }>())
  const tieRef = useCallback(
    (key: string) => (el: SVGLineElement | null) => {
      if (el) ties.current.set(key, el)
      else ties.current.delete(key)
    },
    [],
  )

  const tagRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) tags.current.set(key, el)
      else tags.current.delete(key)
    },
    [],
  )

  // THE LABELS KEEP CLEAR OF EACH OTHER. Two assets close on screen (a
  // drone under a satellite) would put one's call sign or its signatures
  // on the other. Each asset's call sign goes under it or over it, and its
  // signatures over it, beside it or under it, wherever they cover the
  // least of the other assets, the other labels and the chrome.
  const layoutTags = useCallback(() => {
    type Box = [number, number, number, number]
    const list = [...at.current.entries()]
      .filter(([key, p]) => p.on && tags.current.get(key)?.dataset.asset === '1')
      .map(([key, p]) => ({ key, x: p.x, y: p.y, el: tags.current.get(key) as HTMLElement }))
      .sort((a, b) => b.y - a.y)
    const W = innerWidth
    const dock = dockRef.current?.getBoundingClientRect()
    const top = topRef.current?.getBoundingClientRect().bottom ?? 0
    const floor = dock && !wideRef.current ? dock.top : innerHeight
    const right = dock && wideRef.current ? dock.left : W
    const over = (a: Box, b: Box) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
    const out = (a: Box) => (Math.max(0, 4 - a[0]) + Math.max(0, a[2] - (right - 4)) + Math.max(0, top - a[1]) + Math.max(0, a[3] - floor)) * 60
    const bodies = list.map((a): Box => [a.x - 26, a.y - 26, a.x + 26, a.y + 26])
    const taken: Box[] = []
    // A label on another asset costs most, on another label less.
    const cost = (box: Box, self: number, onLabel = 1) => out(box) + bodies.reduce((n, b, i) => (i === self ? n : n + over(box, b) * 3), 0) + taken.reduce((n, b) => n + over(box, b) * onLabel, 0)
    const signs: { flip: boolean; h: number }[] = []
    list.forEach((a, i) => {
      const sign = a.el.querySelector<HTMLElement>('.t3-sign')
      const w = Math.max(60, sign?.offsetWidth ?? 70)
      const h = Math.max(22, sign?.offsetHeight ?? 26)
      const under: Box = [a.x - w / 2, a.y + 20, a.x + w / 2, a.y + 20 + h]
      const above: Box = [a.x - w / 2, a.y - 20 - h, a.x + w / 2, a.y - 20]
      const flip = cost(above, i) < cost(under, i) - 40
      taken.push(flip ? above : under)
      signs.push({ flip, h })
      const want = flip ? '1' : ''
      if (a.el.dataset.flip !== want) a.el.dataset.flip = want
    })
    chipAt.current.clear()
    list.forEach((a, i) => {
      const chips = a.el.querySelector<HTMLElement>('.t3-contacts')
      if (!chips) return
      const w = chips.offsetWidth
      const h = chips.offsetHeight
      const { flip, h: sh } = signs[i]
      const up = -30 - (flip ? sh : 0) - h
      const down = 30 + (flip ? 0 : sh)
      // Where the block's corner can stand, from the asset's centre: over
      // it, beside it, under it, and the corners between.
      const spots: [number, number][] = [
        [-w / 2, up],
        [34, -h / 2],
        [-34 - w, -h / 2],
        [-w / 2, down],
        [8, up],
        [-w - 8, up],
        [8, down],
        [-w - 8, down],
        [34, up + h / 2],
        [-34 - w, up + h / 2],
        [-w / 2, up - 50],
        [-w / 2, down + 50],
        [70, -h / 2],
        [-70 - w, -h / 2],
      ]
      const boxAt = ([dx, dy]: [number, number]): Box => [a.x + dx, a.y + dy, a.x + dx + w, a.y + dy + h]
      // The spot it has keeps it unless another is clearly better, so the
      // labels do not hop as the camera drifts.
      const held = Number(chips.dataset.spot ?? 0)
      let best = held
      let bestCost = cost(boxAt(spots[held] ?? spots[0]), i, 5) - 260
      spots.forEach((spot, k) => {
        const c = cost(boxAt(spot), i, 5) + k * 14
        if (c < bestCost) {
          best = k
          bestCost = c
        }
      })
      taken.push(boxAt(spots[best] ?? spots[0]))
      chipAt.current.set(a.key, { dx: (spots[best] ?? spots[0])[0], dy: (spots[best] ?? spots[0])[1], w, h })
      if (chips.dataset.spot !== String(best) || chips.dataset.w !== String(w)) {
        chips.dataset.spot = String(best)
        chips.dataset.w = String(w)
        chips.style.transform = `translate(${spots[best][0].toFixed(0)}px, ${spots[best][1].toFixed(0)}px)`
      }
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let t: World
    try {
      t = new World(
        canvas,
        (key, x, y, on) => {
          const el = tags.current.get(key)
          if (el) {
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
            el.style.visibility = on ? 'visible' : 'hidden'
          }
          at.current.set(key, { x, y, on })
          const tie = ties.current.get(key)
          if (tie) {
            const box = chipAt.current.get(key)
            const ex = box ? Math.max(x + box.dx, Math.min(x + box.dx + box.w, x)) : x
            const ey = box ? Math.max(y + box.dy, Math.min(y + box.dy + box.h, y)) : y
            const far = Math.hypot(ex - x, ey - y)
            if (!box || !on || far < 34) tie.style.opacity = '0'
            else {
              tie.setAttribute('x1', `${x + ((ex - x) / far) * 24}`)
              tie.setAttribute('y1', `${y + ((ey - y) / far) * 24}`)
              tie.setAttribute('x2', `${ex}`)
              tie.setAttribute('y2', `${ey}`)
              tie.style.opacity = '1'
            }
          }
          if (key === 'comet') {
            frameNo.current += 1
            if (frameNo.current % 5 === 0) layoutTags()
          }
          if (key !== anchor.current) return
          // The card stands beside what it is about: on a wide screen it
          // rides level with the asset, on a phone a line ties them.
          const dock = dockRef.current
          const line = leaderRef.current
          if (!dock) return
          const H = innerHeight
          if (wideRef.current) {
            const dh = dock.offsetHeight
            const left = dock.offsetLeft
            const top = Math.max(84, Math.min(H - dh - 24, y - dh * 0.4))
            const d = dockAt.current
            d.y += (top - d.y) * (d.set ? 0.14 : 1)
            d.set = true
            dock.style.transform = `translate3d(0, ${d.y.toFixed(1)}px, 0)`
            if (line) {
              line.setAttribute('x1', `${x + 34}`)
              line.setAttribute('y1', `${y}`)
              line.setAttribute('x2', `${left - 6}`)
              line.setAttribute('y2', `${Math.max(d.y + 28, Math.min(d.y + dh - 28, y))}`)
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
    world.current = t
    t.onTapEmpty = () => setSel(null)
    t.onPress = () => t.tap()
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
      world.current = null
      delete (window as unknown as { __dc3d?: unknown }).__dc3d
    }
    // The world is built once; what changes is told to it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The app's CRT overlay and page scroll belong to the pixel game.
  useEffect(() => {
    document.documentElement.classList.add('t3-on')
    return () => document.documentElement.classList.remove('t3-on')
  }, [])

  useEffect(() => world.current?.setRunning(visible), [visible, failed])
  useEffect(() => world.current?.setReduced(reduced), [reduced])
  useEffect(() => world.current?.setLowPower(pf.lowPower), [pf.lowPower, failed])
  useEffect(() => world.current?.setSkin(unlocksFor(progress(), dossier().size).skins[pf.skin] ? pf.skin : 'standard'), [pf.skin, failed])

  // A device that cannot hold the frame rate is moved to low power, once,
  // and told; SYSTEM turns it back.
  useEffect(() => {
    if (pf.lowPower || failed) return
    const id = window.setTimeout(() => {
      const t = world.current
      if (!t || !visible || t.fps() >= 40) return
      setPf((p) => ({ ...p, lowPower: true }))
      setSay(`${c3.LOW_POWER} on. ${c3.LOW_POWER_NOTE}`)
    }, 6000)
    return () => window.clearTimeout(id)
    // Checked once, a few seconds in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed])

  // The fleet: every asset the game holds, the ones that came in at this
  // dawn flying in.
  useEffect(() => {
    const t = world.current
    if (!t) return
    const arriving = new Set(phase === 'dawn' && last ? last.night.record.ledger.arrivals : [])
    t.syncAssets(
      game.assets.map((a) => ({ id: a.id, kind: a.kind })),
      arriving,
    )
    t.setSkin(unlocksFor(progress(), dossier().size).skins[pf.skin] ? pf.skin : 'standard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.assets.length, game.seed, failed])

  // What stands on the board the world shows: integrity, losses, the
  // conditions on links and assets, the streak's ring.
  const board = phase === 'night' || phase === 'dawn' ? shown : game
  useEffect(() => {
    const t = world.current
    if (!t || phase === 'replay') return
    const conds = conditionsOn(board)
    const lingering = new Set<string>()
    t.clearSignatures('cond:')
    for (const a of board.assets) {
      if (a.integrity <= 0) t.setLost(a.id, true)
      else {
        t.setLost(a.id, false)
        t.setIntegrity(a.id, a.integrity)
      }
      const on = conds.get(a.id) ?? []
      t.setJammed(a.id, on.some((c) => JAMS.has(c.eventId)))
      // A condition that is not a jam lingers as its signature, on the
      // first asset it sits on.
      for (const c of on) {
        if (JAMS.has(c.eventId) || lingering.has(c.eventId)) continue
        lingering.add(c.eventId)
        t.setSignature(`cond:${c.eventId}`, c.eventId, a.id, 0.4)
      }
    }
    t.setStreak(board.streak)
  }, [board, phase, failed])

  // The defenses, where they were set down: owned ones and tonight's.
  useEffect(() => {
    const t = world.current
    if (!t) return
    const counts = new Map<string, number>()
    const ids = [...game.counters, ...(orders.defense && !game.counters.includes(orders.defense) ? [orders.defense] : [])]
    for (const id of ids) {
      const where = placed[id] ?? game.assets.find((a) => a.integrity > 0 && a.kind === 'groundStation')?.id ?? game.assets[0]?.id
      if (where) counts.set(where, (counts.get(where) ?? 0) + 1)
    }
    t.setModules(counts)
  }, [game, orders.defense, placed, failed])

  // What is aimed. Before the night: every signature, in the tone of what
  // is known of it. In the night: the strikes still to come.
  const stepNo = phase === 'night' && stage.at !== 'fall' ? stage.i : -1
  const planContacts = useRef<Contact[]>([])
  if (deciding) planContacts.current = contacts
  const shielded = useRef(new Set<string>())
  useEffect(() => {
    const t = world.current
    if (!t) return
    const tone = (c: Contact) => (c.known ? (c.favor === 'confirmed' ? 'likely' : c.favor) : 'unknown')
    if (phase === 'plan') {
      t.setAims(contacts.filter((c) => c.targetId && !c.debris).map((c) => ({ key: `c:${c.id}`, targetId: c.targetId as string, blocked: c.known && c.exposed === 0, tone: tone(c) })))
    } else if (phase === 'night' && now) {
      const from = stage.at === 'fall' ? 0 : stage.at === 'launch' ? stage.i : stage.i + 1
      t.setAims(
        now.night.steps
          .filter((s) => s.kind === 'threat' && s.index >= from && s.ev.targetAssetId)
          .map((s) => {
            const known = planContacts.current.find((c) => c.id === s.def.id)?.known ?? true
            return { key: `c:${s.def.id}`, targetId: s.ev.targetAssetId as string, blocked: known && s.ev.effectiveSeverity === 0 && !s.ev.response, tone: known ? ('likely' as const) : ('unknown' as const) }
          }),
      )
    } else t.setAims([])
    // A defense's shield stands on every asset it holds an identified move
    // off tonight.
    const want = new Set(phase === 'plan' ? contacts.filter((c) => c.known && !c.debris && c.exposed === 0 && c.favor !== 'unlikely' && c.targetId).map((c) => c.targetId as string) : phase === 'night' ? [...shielded.current] : [])
    for (const id of want) if (!shielded.current.has(id)) t.setShield(id, 'defense')
    for (const id of shielded.current) if (!want.has(id)) t.setShield(id, null)
    shielded.current = want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, contacts, stepNo, stage.at, failed])

  // The card's anchor, the camera's focus, and the look of what is in hand.
  const step: NightStep | undefined = phase === 'night' && now && stage.at !== 'fall' ? now.night.steps[stage.i] : undefined
  const selContact = sel?.kind === 'contact' ? contacts.find((c) => c.id === sel.id) : undefined
  const anchorId =
    phase === 'plan' ? (sel?.kind === 'asset' ? sel.id : (selContact?.targetId ?? null)) : phase === 'night' && step && (stage.at === 'choose' || stage.at === 'call' || stage.at === 'result') ? (step.ev.targetAssetId ?? null) : null
  useLayoutEffect(() => {
    anchor.current = anchorId
    dockAt.current.set = false
    const dock = dockRef.current
    if (dock && (!anchorId || !wide)) dock.style.transform = ''
    if (leaderRef.current && !anchorId) leaderRef.current.style.opacity = '0'
  }, [anchorId, wide])

  useEffect(() => {
    const t = world.current
    if (!t || phase !== 'plan') return
    t.setFocus(anchorId)
    t.setSignature('preview', selContact ? selContact.id : null, selContact?.targetId, 0.75)
  }, [phase, anchorId, selContact, failed])

  // The theater frames itself in what the chrome leaves clear.
  useLayoutEffect(() => {
    const dock = dockRef.current
    const top = topRef.current
    if (!dock || !top) return
    const tell = () => {
      const H = innerHeight || 1
      const clearTop = top.getBoundingClientRect().bottom / H
      if (wide) world.current?.setClear(clearTop, 0.97, 1 - (dock.offsetWidth + 72) / (innerWidth || 1))
      else world.current?.setClear(clearTop, Math.max(0.4, Math.min(0.9, (H - dock.offsetHeight - 8) / H)), 1)
    }
    tell()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(tell)
    ro.observe(dock)
    return () => ro.disconnect()
  }, [wide, failed, phase])

  // ---------------------------------------------------- the run's record

  // Autosave as each turn opens, so a refresh resumes it; a night left in
  // the middle is closed on return (below).
  useEffect(() => {
    if (mode !== 'play' || game.status !== 'playing' || phase !== 'plan') return
    saveStore.autosave(game, 'brief', daily)
    dropViewParam()
  }, [mode, game, phase, daily])

  const fresh = game.status === 'playing' && game.history.length === 0
  useEffect(() => {
    if (mode === 'play' && fresh) beginRun(run, dossier())
  }, [mode, run, fresh])
  const playing = game.status === 'playing' && phase !== 'opening'
  useEffect(() => {
    if (mode !== 'play' || !playing || !visible) return
    const started = performance.now()
    return () => addRunTime(run, performance.now() - started)
  }, [mode, run, playing, visible])

  // A finished game is recorded once: the scoreboard or the Daily Op's
  // ledger, as the pixel board records it, and what it unlocked.
  const finish = (after: GameState) => {
    if (recorded.current) return
    recorded.current = true
    saveStore.clearAutosave()
    const lastRec = after.history[after.history.length - 1]
    const recordedAt = new Date().toISOString()
    const bonus = defenseBonus(after.bestStreak, after.saved)
    if (!daily)
      scoreSink.record({ outcome: after.status as 'won' | 'lost', lossReason: after.lossReason, mai: lastRec?.maiScore ?? 0, seed: after.seed, turnsSurvived: after.history.length, totalTurns: after.scenario.totalTurns, scenarioId: after.scenario.id, difficulty: after.difficulty, bonus, recordedAt })
    else setStanding(dailyLedger.claim(daily, { n: daily.n, seed: after.seed, outcome: after.status as 'won' | 'lost', lossReason: after.lossReason, mai: lastRec?.maiScore ?? 0, bonus, turns: after.history.length, recordedAt }))
    setEarned(recordFinish(after, dossier().size))
  }

  // The night is over: the engine's turn is committed.
  const commit = (before: GameState, after: GameState, night: Night) => {
    const record = night.record
    recordMet(record.events.map((e) => e.eventId))
    recordNamed(record.named)
    const names = callSigns(before)
    logNight(night.steps.filter((s) => s.kind === 'threat').map((s) => ({ eventId: s.def.id, landed: s.ev.effectiveSeverity > 0, sign: names.get(s.ev.targetAssetId ?? '') ?? '' })))
    clearNight()
    setLast({ before, night, after })
    setShown(after)
    setGame(after)
    setOrders(NO_ORDERS)
    setInputs(NO_INPUTS)
    if (after.status === 'playing') saveStore.autosave(after, 'brief', daily)
    else finish(after)
    setPhase('dawn')
  }

  // A night left in the middle (a reload): closed with the answers given,
  // the rest ridden out, and shown at its dawn.
  useEffect(() => {
    if (mode !== 'play' || game.status !== 'playing' || phase !== 'plan') return
    const mark = nightMark(run, game.turn)
    if (!mark) return
    try {
      const closed = nightNow(game, mark.orders, { ...mark.inputs, debris: mark.inputs.debris ?? 'hold' })
      commit(game, closed.after, closed.night)
    } catch {
      clearNight()
    }
    // Once, as the game arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --------------------------------------------------------------- orders

  // An order changed: the risk is asked about afresh.
  useEffect(() => setAtRisk(false), [orders])

  const float = (key: string, text: string, tone: Floater['tone']) => {
    const id = Date.now() + Math.random()
    setFloaters((f) => [...f, { id, key, text, tone }])
    window.setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2200)
  }

  const scanBusy = useRef(false)
  const doScan = async (id: string) => {
    const c = contacts.find((x) => x.id === id)
    if (!deciding || !c || !canScan(game, orders, c) || scanBusy.current) return
    scanBusy.current = true
    play('data-burst')
    setSel({ kind: 'contact', id })
    if (c.targetId) await world.current?.scan(c.targetId)
    scanBusy.current = false
    setOrders((o) => (o.scans.includes(id) ? o : { ...o, scans: [...o.scans, id] }))
    play('arrive-chime')
    setSay(c3.scannedSay(shortName(c.def)))
    if (guide === 'scan') setGuide('place')
  }

  const place = (id: CountermeasureId, assetId?: string) => {
    if (!deciding || game.counters.includes(id)) return
    const cm = defenseDef(game, id)
    if (orders.defense === id && !assetId) {
      setOrders({ ...orders, defense: null })
      play('buy-click')
      setNote('')
      setSay(c3.removedSay(cm.name))
      return
    }
    const piece = kit.find((p) => p.cm.id === id)
    if (!piece || (piece.blocked && !piece.ordered)) return play('denied-buzz')
    const where = assetId ?? selContact?.targetId ?? game.assets.find((a) => a.integrity > 0 && piece.domain.includes(a.kind))?.id ?? game.assets[0]?.id
    const next = { ...orders, defense: id }
    const before = contacts
    const after = contactsFor(game, next)
    setOrders(next)
    if (where) {
      const at2 = { ...placed, [id]: where }
      setPlaced(at2)
      setPlacements(run, at2)
      world.current?.placeFx(where)
    }
    play('buy-click')
    // COLDVEIL reacts to what is placed: say so when a track's favor moves.
    const moved = after.find((c) => c.favor === 'likely' && before.find((b) => b.id === c.id)?.favor !== 'likely' && before.some((b) => b.slot === c.slot && b.favor === 'likely'))
    setNote(moved ? `${c3.trackOf(moved.slot + 1, tracks)}: COLDVEIL reroutes to ${moved.known ? shortName(moved.def) : 'an unidentified move'}. ${TONIGHT_REASON}` : '')
    setSay(c3.placedSay(cm.name, signs.get(where ?? '') ?? 'the fleet'))
    if (guide === 'place' || guide === 'scan') setGuide('begin')
  }

  const toggleAsset = (kind: AssetKind) => {
    if (!deciding) return
    const has = orders.assets.includes(kind)
    if (!has && !fleet.find((f) => f.kind === kind)?.fits) return play('denied-buzz')
    play('buy-click')
    setOrders({ ...orders, assets: has ? orders.assets.filter((k) => k !== kind) : [...orders.assets, kind] })
  }

  const begin = () => {
    if (!deciding) return
    // A night that could break the budget is begun on a second tap, with
    // what it risks said first: insolvency ends the operation.
    if (stakes && stakes.worst < 0 && !atRisk) {
      setAtRisk(true)
      play('denied-buzz')
      setSay(c3.riskLine(stakes.worst))
      return
    }
    setAtRisk(false)
    markNight({ run, turn: game.turn, orders, inputs: NO_INPUTS })
    setSel(null)
    setNote('')
    setInputs(NO_INPUTS)
    setStage({ at: 'fall' })
    setPhase('night')
    world.current?.setSignature('preview', null)
    play('execute-sweep')
    setSay(copy.MOVING)
    if (guide && guide !== 'done') setGuide(null)
  }

  // ------------------------------------------------------------ the night

  const answer = (next: NightInputs) => {
    setInputs(next)
    markNight({ run, turn: game.turn, orders, inputs: next })
  }

  useEffect(() => {
    if (phase !== 'night') return
    const t = world.current
    const cur = nowRef.current
    if (!t || !cur) return
    let live = true
    let stopMotif = () => {}
    const night = cur.night
    const g = gameRef.current
    const names = callSigns(g)
    const go = async () => {
      if (stage.at === 'fall') {
        t.setFocus(null)
        t.setBeat('night')
        setShown(night.opening)
        const pressed = tenth(maiScore(night.opening) - maiScore(g))
        setHud({ score: maiScore(night.opening), credits: night.opening.credits })
        if (pressed < -0.05) setSay(c3.pressed(night.pressed.join(', '), pressed))
        await t.wait(reduced ? 0.7 : 1.5)
        if (live) setStage({ at: 'launch', i: 0 })
        return
      }
      const s = night.steps[stage.i]
      if (!s) {
        if (live) commit(g, cur.after, night)
        return
      }
      const target = s.ev.targetAssetId
      const key = `c:${s.def.id}`
      if (stage.at === 'launch') {
        setFiled(null)
        setOpenCard(false)
        t.clearNight()
        t.closeWindow()
        if (s.kind === 'opportunity') {
          play(MOMENT_CUES.opportunity.sound)
          setShown(s.after)
          setHud({ score: s.scoreAfter, credits: s.after.credits })
          if (live) setStage({ at: 'result', i: stage.i })
          return
        }
        if (s.kind === 'debris') {
          if (!target) {
            if (live) setStage({ at: 'result', i: stage.i })
            return
          }
          stopMotif = playMotif(play, s.def.id)
          setSay(`Conjunction alert on ${names.get(target) ?? 'the fleet'}.`)
          await t.debrisIn(target)
          if (!live) return
          setStage(inputsRef.current.debris === null ? { at: 'call', i: stage.i } : { at: 'land', i: stage.i })
          return
        }
        if (!target) {
          if (live) setStage({ at: 'impact', i: stage.i })
          return
        }
        const asks = cur.open === stage.i
        const can = asks && choicesFor(g, ordersRef.current, inputsRef.current, stage.i, s).some((c) => c.id !== null && c.fits)
        const chain = s.def.id === 'blackout-chain'
        stopMotif = playMotif(play, s.def.id)
        setSay(`Incoming: ${shortName(s.def)} on ${names.get(target) ?? 'the fleet'}.`)
        if (chain) {
          // The set piece: the lights over the area of operations go out.
          t.setBlackout(true)
          await t.wait(reduced ? 0.4 : 1.2)
          if (!live) return
        }
        t.setSignature('strike', s.def.id, target, 1)
        await t.launch(key, target, can)
        if (!live) return
        if (can) {
          setStage({ at: 'choose', i: stage.i })
          setGuide((gd) => (gd === null && !readPrefs().guideSeen && g.turn === 1 ? 'respond' : gd))
        } else {
          // Tonight's one response is used, or the budget cannot meet one:
          // the move is ridden out, and the result says so.
          if (asks) answer(withResponse(inputsRef.current, stage.i, null))
          setStage({ at: 'land', i: stage.i })
        }
        return
      }
      if (stage.at === 'land') {
        if (s.kind === 'debris' && target && s.ev.debris) {
          const where = t.posOf(target)
          if (s.ev.debris.choice === 'burn') {
            play('data-burst')
            await t.burn(target)
            if (!live) return
          }
          await t.debrisPass(target, where, s.ev.debris.lost)
          if (live) setStage({ at: 'impact', i: stage.i })
          return
        }
        if (!target) {
          if (live) setStage({ at: 'impact', i: stage.i })
          return
        }
        const verdict = verdictOf(s.ev)
        if (s.ev.response) {
          setHud((h) => ({ ...h, credits: h.credits - (s.ev.response?.cost ?? 0) }))
          await t.wait(reduced ? 0.2 : 0.45)
          if (!live) return
        } else if (verdict === 'blocked') t.setShield(target, 'defense')
        const ring = !assist
        setTapOpen(ring)
        if (ring) setGuide((gd) => (gd === 'respond' || (gd === null && !readPrefs().guideSeen && g.turn === 1) ? 'tap' : gd))
        await t.approach(ring)
        if (!live) return
        const impact: Impact = verdict === 'blocked' ? 'blocked' : verdict === 'hit' ? 'hit' : 'halved'
        const landing = t.land(impact, 0.1)
        const grade: TimingGrade | 0 = assist ? ASSIST_GRADE : gradeTap(await t.tapOffset())
        await landing
        if (!live) return
        setTapOpen(false)
        t.tapFx(target, grade)
        if (grade) {
          play(grade === 2 ? 'relief-chime' : 'tick-up')
          if (!assist) float(target, grade === 2 ? 'PERFECT' : 'GOOD', 'timed')
        }
        answer(withTiming(inputsRef.current, stage.i, grade))
        setStage({ at: 'impact', i: stage.i })
        return
      }
      if (stage.at === 'impact') {
        const ev = s.ev
        t.setSignature('strike', null)
        if (s.kind === 'debris') {
          play(ev.debris?.lost ? MOMENT_CUES['strike-hit'].sound : MOMENT_CUES['debris-result'].sound)
          if (target && ev.debris?.lost) float(target, 'LOST', 'hit')
          setShown(s.after)
          setHud({ score: s.scoreAfter, credits: s.after.credits })
          await t.wait(reduced ? 0.3 : 0.7)
          if (live) setStage({ at: 'result', i: stage.i })
          return
        }
        const verdict = verdictOf(ev)
        const delta = tenth(s.scoreAfter - s.scoreBefore)
        play(strikeSound(ev.eventId, ev.effectiveSeverity > 0), { intensity: strikeIntensity(ev.effectiveSeverity) })
        if (target) float(target, verdict === 'blocked' ? VERDICT_WORD.blocked : `${VERDICT_WORD[verdict]} ${delta.toFixed(1)}`, verdict)
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
      stopMotif()
    }
    // Each stage runs once, on the night as it stood when the stage began.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stage])

  const respond = (id: string | null, via?: string) => {
    if (phase !== 'night' || stage.at !== 'choose' || !step || !now) return
    const target = step.ev.targetAssetId
    const choice = choicesFor(game, orders, inputs, stage.i, step).find((c) => c.id === id)
    if (!choice || !choice.fits) return play('denied-buzz')
    const t = world.current
    if (id && target && t) {
      // The answer goes up as it was made: a link through a relay, a ring
      // around the asset, a shield of its own for tonight.
      if (choice.gesture === 'reroute') {
        const relay = via ?? game.assets.find((a) => a.integrity > 0 && a.id !== target && a.kind !== 'drone')?.id
        if (relay) t.setVia(target, relay)
      }
      if (choice.gesture === 'isolate') t.setIsolated(target, true)
      t.setShield(target, 'response')
      play('buy-click')
    }
    answer(withResponse(inputs, stage.i, id))
    setStage({ at: 'land', i: stage.i })
    if (guide === 'respond') setGuide(null)
  }

  const call = (choice: DebrisChoice) => {
    if (phase !== 'night' || stage.at !== 'call') return
    play('buy-click')
    answer({ ...inputs, debris: choice })
    setStage({ at: 'land', i: stage.i })
  }

  const onward = (collect: boolean) => {
    if (phase !== 'night' || stage.at !== 'result' || filed || !now) return
    const i = stage.i
    const next = () => setStage({ at: 'launch', i: i + 1 })
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
    const t = world.current
    if (!t) return
    if (phase === 'dawn' && last) {
      t.clearNight()
      t.closeWindow()
      t.clearSignatures('strike')
      t.setBlackout(false)
      t.settle()
      t.setFocus(null)
      t.setBeat('dawn')
      const rec = last.night.record
      const over = last.after.status !== 'playing'
      const id = window.setTimeout(
        () => {
          setHud({ score: rec.maiScore, credits: rec.creditsAfter })
          play(over ? outcomeSound(last.after.status === 'won') : MOMENT_CUES['end-of-turn'].sound)
        },
        reduced ? 200 : 900,
      )
      setSay(`Dawn. Score ${rec.maiScore.toFixed(1)}. ${c3.streakSay(last.after.streak)}`)
      // The first dawn ends the guide, whatever of it the night reached.
      if (mode === 'play' && !readPrefs().guideSeen) setGuide('done')
      return () => window.clearTimeout(id)
    }
    if (phase === 'plan') t.setBeat('wide')
    if (phase === 'debrief') {
      t.setBeat('dawn')
      t.setFocus(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, last, failed])

  const nextTurn = () => {
    if (!last) return
    if (guide === 'done') {
      setGuide(null)
      setPf(setPrefs({ guideSeen: true }))
    }
    setFloaters([])
    setFiled(null)
    setHud({ score: maiScore(last.after), credits: last.after.credits })
    setPhase(last.after.status === 'playing' ? 'plan' : 'debrief')
  }

  const again = () => {
    const op = arrive(newOperation(deviceDifficulty()))
    recorded.current = false
    setGame(op.state)
    setShown(op.state)
    setDaily(undefined)
    setStanding(null)
    setOrders(NO_ORDERS)
    setInputs(NO_INPUTS)
    setSel(null)
    setLast(null)
    setEarned([])
    setFloaters([])
    setPlaced({})
    setHud({ score: maiScore(op.state), credits: op.state.credits })
    setPhase('plan')
    const t = world.current
    if (t) {
      for (const id of shielded.current) t.setShield(id, null)
      shielded.current = new Set()
      t.setBlackout(false)
      t.clearSignatures()
    }
  }

  const leave = () => {
    dropViewParam()
    onExit()
  }

  // ------------------------------------------------------------ the hands

  // Something picked up: it follows the finger, the places it can go
  // light, and letting go on one acts. A press that does not move is a
  // tap, and the element's own click handles it.
  const dragging = useRef<Drag | null>(null)
  const swallow = useRef(false)
  const dwellTimer = useRef(0)
  const scannedAt = useRef({ x: -99, y: -99 })
  const assetAt = (x: number, y: number, radius = 52): string | null => {
    let best: string | null = null
    let bestD = radius
    for (const [key, p] of at.current) {
      if (!p.on || tags.current.get(key)?.dataset.asset !== '1') continue
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bestD) {
        bestD = d
        best = key
      }
    }
    return best
  }
  const contactAt = (x: number, y: number): string | null => {
    let best: string | null = null
    let bestD = 40
    for (const el of document.querySelectorAll<HTMLElement>('[data-t3-contact]')) {
      const r = el.getBoundingClientRect()
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y)
      if (d < bestD) {
        bestD = d
        best = el.dataset.t3Contact ?? null
      }
    }
    return best
  }
  const dropOk = (d: Drag, target: string | null): boolean => {
    if (!target) return false
    if (d.kind === 'scan') return contacts.some((c) => c.id === target && !c.known)
    const a = assetById(board, target)
    if (!a || a.integrity <= 0) return false
    if (d.kind === 'piece') return !!kit.find((p) => p.cm.id === d.id)?.domain.includes(a.kind)
    if (d.kind === 'response') return target === step?.ev.targetAssetId
    if (d.kind === 'link') return target !== step?.ev.targetAssetId && a.kind !== 'drone'
    return false
  }
  const startDrag = (e: ReactPointerEvent<HTMLElement>, kind: Drag['kind'], id: string, label: string) => {
    if (e.button !== undefined && e.button > 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let live: Drag | null = null
    const move = (ev: PointerEvent) => {
      const far = Math.hypot(ev.clientX - x0, ev.clientY - y0)
      if (!live && far < 9) return
      const over = kind === 'scan' ? contactAt(ev.clientX, ev.clientY) : kind === 'burn' ? null : assetAt(ev.clientX, ev.clientY)
      const next: Drag = { kind, id, label, x: ev.clientX, y: ev.clientY, fromX: x0, fromY: y0, over }
      const ok = dropOk(next, over)
      if (kind === 'scan') {
        // The lens names what it rests on for a moment.
        // (After a scan the lens must move on before it names another.)
        const rested = Math.hypot(ev.clientX - scannedAt.current.x, ev.clientY - scannedAt.current.y) < 14
        const want = ok && !rested ? over : null
        if (want !== (live?.over ?? null) || !live) {
          window.clearTimeout(dwellTimer.current)
          setDwell(want)
          if (want)
            dwellTimer.current = window.setTimeout(() => {
              scannedAt.current = { x: ev.clientX, y: ev.clientY }
              void doScan(want)
            }, 520)
        }
      }
      live = { ...next, over: ok ? over : null }
      dragging.current = live
      setDrag(live)
      const line = dragLine.current
      if (line && (kind === 'link' || kind === 'burn')) {
        line.setAttribute('x1', `${x0}`)
        line.setAttribute('y1', `${y0}`)
        line.setAttribute('x2', `${ev.clientX}`)
        line.setAttribute('y2', `${ev.clientY}`)
      }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.clearTimeout(dwellTimer.current)
      setDwell(null)
      const d = live
      dragging.current = null
      setDrag(null)
      if (!d) return
      // It was a drag: the click that follows is not a tap.
      swallow.current = true
      window.setTimeout(() => (swallow.current = false), 60)
      if (d.kind === 'burn') {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 56) call('burn')
        return
      }
      if (!d.over) return
      if (d.kind === 'piece') place(d.id as CountermeasureId, d.over)
      if (d.kind === 'response') respond(d.id)
      if (d.kind === 'link') respond(d.id, d.over)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const tapped = (fn: () => void) => () => {
    if (swallow.current) return
    fn()
  }

  // What the night lets the player do on the world itself.
  const choices = phase === 'night' && stage.at === 'choose' && step ? choicesFor(game, orders, inputs, stage.i, step) : []
  const rerouteChoice = choices.find((c) => c.fits && c.gesture === 'reroute')
  const isolateChoice = choices.find((c) => c.fits && c.gesture === 'isolate')

  // Each card puts the way on under the thumb and in focus.
  const primary = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (phase === 'night' && (stage.at === 'choose' || stage.at === 'call' || stage.at === 'result')) primary.current?.focus({ preventScroll: true })
    if (phase === 'dawn') primary.current?.focus({ preventScroll: true })
  }, [phase, stage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (room) setRoom(null)
      else if (sheet) setSheet(false)
      else setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [room, sheet])

  // ----------------------------------------------------------------- view

  const score = useCountUp(hud.score, reduced, 700)
  const credits = useCountUp(phase === 'plan' && stakes ? stakes.remaining : hud.credits, reduced, 500)
  const line = game.scenario.winThreshold
  const turnShown = phase === 'dawn' && last ? last.night.record.turn : Math.min(game.turn, totalTurns)
  const threatSteps = now ? now.night.steps.filter((s) => s.kind === 'threat') : []
  const phaseLine =
    phase === 'plan'
      ? c3.PHASE.plan
      : phase === 'dawn'
        ? c3.PHASE.dawn
        : phase === 'debrief'
          ? c3.PHASE.debrief
          : phase === 'replay'
            ? c3.PHASE.replay
            : phase === 'opening'
              ? c3.PHASE.opening
              : stage.at === 'fall'
                ? copy.MOVING
                : step?.kind === 'threat'
                  ? c3.strikeOf(threatSteps.filter((s) => s.index <= (stage as { i: number }).i).length, threatSteps.length)
                  : c3.PHASE.night

  if (mode === 'dossier') {
    return (
      <div className="t3-root t3-roomonly" data-game3d={CHUNK_MARK}>
        <DossierRoom onBack={leave} />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="t3-root t3-failed" data-game3d={CHUNK_MARK}>
        <p>This device could not start the 3D view.</p>
        <a className="t3-btn" href="?view=classic">
          {c3.CLASSIC}
        </a>
        <button type="button" className="t3-btn" onClick={leave}>
          {c3.TITLE}
        </button>
      </div>
    )
  }

  const selAsset = sel?.kind === 'asset' ? assetById(board, sel.id) : undefined
  const selPiece = sel?.kind === 'piece' ? kit.find((p) => p.cm.id === sel.id) : undefined
  const contactsOn = (id: string) => (deciding ? contacts.filter((c) => c.targetId === id) : [])
  const conds = conditionsOn(board)
  const ownedName = orders.defense ? PIECE[orders.defense] : null
  const dragOk = drag ? new Set(board.assets.filter((a) => dropOk(drag, a.id)).map((a) => a.id)) : null
  const armed = selPiece && !selPiece.blocked && !selPiece.ordered ? new Set(board.assets.filter((a) => a.integrity > 0 && selPiece.domain.includes(a.kind)).map((a) => a.id)) : null
  const modulesOn = (id: string) => [...game.counters, ...(orders.defense ? [orders.defense] : [])].filter((c) => placed[c] === id).map((c) => defenseDef(game, c).name)

  // What a placed answer makes COLDVEIL do, for the card in hand.
  const answersFor = (c: Contact): AnswerView[] =>
    c.answers.map((a) => {
      const piece = kit.find((p) => p.cm.id === a.cm.id)
      let then = ''
      if (!a.owned && !a.ordered && !c.debris && !c.fixed) {
        const after = contactsFor(game, { ...orders, defense: a.cm.id })
        const self = after.find((x) => x.id === c.id)
        const dodge = after.find((x) => x.slot === c.slot && x.id !== c.id && (x.favor === 'likely' || x.favor === 'either') && x.exposed > 0)
        if (self && self.favor === 'unlikely' && dodge) then = `then COLDVEIL switches to ${dodge.known ? shortName(dodge.def) : 'an unidentified move'}`
      }
      return { id: a.cm.id, name: a.cm.name, cost: a.cm.cost, verb: a.verb, owned: a.owned, ordered: a.ordered, blocked: piece?.blocked ?? null, risky: !!piece?.risky && !a.ordered, then }
    })

  const assetTap = (id: string) => {
    if (phase === 'plan') {
      if (armed?.has(id) && selPiece) return place(selPiece.cm.id, id)
      setSel(sel?.kind === 'asset' && sel.id === id ? null : { kind: 'asset', id })
      play('soft-tick')
      return
    }
    if (phase === 'night' && stage.at === 'choose' && step?.ev.targetAssetId === id && isolateChoice) respond(isolateChoice.id)
  }
  const assetDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (phase !== 'night' || !step || step.ev.targetAssetId !== id) return
    if (stage.at === 'choose' && rerouteChoice?.id) startDrag(e, 'link', rerouteChoice.id, RESPONSE_TEXT[step.def.id]?.[rerouteChoice.id] ?? '')
    if (stage.at === 'call') startDrag(e, 'burn', id, copy.BURN)
  }

  const nightTarget = phase === 'night' && step ? step.ev.targetAssetId : undefined
  const showPlanHome = deciding && !(selContact || selAsset || selPiece || sel?.kind === 'fleet')

  return (
    <div
      className={`t3-root${wide ? ' t3-wide' : ''}${drag ? ' is-dragging' : ''}`}
      data-game3d={CHUNK_MARK}
      data-t3-phase={phase}
      data-t3-stage={phase === 'night' ? stage.at : phase}
      data-t3-step={phase === 'night' && stage.at !== 'fall' ? stage.i : undefined}
      data-t3-turn={turnShown}
      data-t3-target={nightTarget}
      data-t3-pulses={deciding ? scan.left : undefined}
      data-t3-status={game.status}
      data-reduced={reduced || undefined}
      onPointerDownCapture={tapOpen ? () => world.current?.tap() : undefined}
    >
      <canvas ref={canvasRef} className="t3-canvas" role="img" aria-label="Orbital view: the STORMGLASS-9 satellites, the KESTREL drones and the ground station over the area of operations, with COLDVEIL off the night side. Drag to look around." />

      <svg className="t3-leader" aria-hidden="true">
        <line ref={leaderRef} x1="0" y1="0" x2="0" y2="0" />
        <line ref={dragLine} className="t3-dragline" x1="0" y1="0" x2="0" y2="0" style={{ opacity: drag && (drag.kind === 'link' || drag.kind === 'burn') ? 1 : 0 }} />
        {deciding && game.assets.filter((a) => contacts.some((c) => c.targetId === a.id)).map((a) => <line key={a.id} ref={tieRef(a.id)} className="t3-tie" x1="0" y1="0" x2="0" y2="0" />)}
      </svg>

      {/* The world's own labels: each asset is a button on the asset, and
          each signature over it a button of its own. */}
      <div className="t3-tags" aria-hidden={phase === 'opening' || phase === 'debrief' || undefined}>
        <div ref={tagRef('coldveil')} className="t3-tag t3-tag-foe" aria-hidden="true">
          <span>COLDVEIL</span>
        </div>
        <div ref={tagRef('score')} className="t3-tag t3-tag-score" aria-hidden="true">
          {phase === 'dawn' && last && (
            <p className="t3-worldscore" data-t3-final>
              <span>MISSION ASSURANCE</span>
              <b>{score.toFixed(1)}</b>
              <i className={last.night.record.maiScore - maiScore(last.before) < -0.05 ? 't3-bad' : 't3-ok'}>{c3.tonight(tenth(last.night.record.maiScore - maiScore(last.before)))}</i>
            </p>
          )}
        </div>
        <div ref={tagRef('comet')} className="t3-tag t3-tag-comet" aria-hidden="true">
          {phase === 'night' && step?.kind === 'threat' && (stage.at === 'launch' || stage.at === 'choose') && (
            <span>
              {c3.TAG[step.def.id] ?? shortName(step.def)} {dots(step.ev.baseSeverity + step.ev.chainBonus)}
            </span>
          )}
        </div>
        {game.assets.map((a) => {
          const asset = assetById(board, a.id) ?? a
          const sign = signs.get(a.id) ?? a.id
          const on = contactsOn(a.id)
          const lost = asset.integrity <= 0
          const hurt = asset.integrity < 100
          const cond = conds.get(a.id) ?? []
          const isTarget = nightTarget === a.id
          const can = phase === 'plan' ? !lost : isTarget && ((stage.at === 'choose' && (!!isolateChoice || !!rerouteChoice)) || stage.at === 'call')
          const lit = dragOk?.has(a.id) || armed?.has(a.id)
          const label = `${sign}, ${kindLabels[a.kind]}, ${lost ? 'lost' : `integrity ${asset.integrity}%`}${cond.length ? `. ${cond.map((c) => c.name).join(', ')}` : ''}${on.length ? `. ${on.length} signature${on.length === 1 ? '' : 's'} over it` : ''}${
            armed?.has(a.id) && selPiece ? `. Place ${selPiece.cm.name} here` : isTarget && stage.at === 'choose' && isolateChoice ? '. Tap to isolate it' : ''
          }`
          return (
            <div key={a.id} ref={tagRef(a.id)} className="t3-tag" data-asset="1">
              <button
                type="button"
                data-t3-asset={a.id}
                data-t3-kind={a.kind}
                data-t3-sign={sign}
                aria-label={label}
                aria-pressed={sel?.kind === 'asset' && sel.id === a.id}
                disabled={!can}
                className={`t3-asset${sel?.kind === 'asset' && sel.id === a.id ? ' is-on' : ''}${lit ? ' is-drop' : ''}${drag?.over === a.id ? ' is-over' : ''}${on.some((x) => x.known && x.exposed > 0 && x.favor !== 'unlikely') ? ' is-aimed' : ''}${
                  isTarget && stage.at === 'choose' && isolateChoice ? ' is-isolate' : ''
                }${lost ? ' is-lost' : ''}`}
                onPointerDown={(e) => assetDown(e, a.id)}
                onClick={tapped(() => assetTap(a.id))}
              >
                <span className="t3-sign">
                  {sign}
                  {!lost && (
                    <span className={`t3-bar${hurt ? ' is-hurt' : ''}`}>
                      <i style={{ width: `${asset.integrity}%` }} />
                    </span>
                  )}
                  {lost && <b>LOST</b>}
                  {!lost && hurt && phase !== 'plan' && <b>{asset.integrity}%</b>}
                  {cond.map((c) => (
                    <em key={c.eventId} className="t3-cond">
                      {c.name} {c.left}
                    </em>
                  ))}
                </span>
              </button>
              {on.length > 0 && (
                <div className="t3-contacts">
                  {on.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-t3-contact={c.id}
                      data-known={c.known}
                      data-favor={c.favor}
                      aria-pressed={sel?.kind === 'contact' && sel.id === c.id}
                      aria-label={
                        c.known
                          ? `${shortName(c.def)}, strength ${c.strength}, over ${sign}. ${c.exposed === 0 ? 'Your shield stops it' : c3.FAVOR_TAG[c.favor]}.`
                          : `Unidentified signature over ${sign}, track ${c.slot + 1}. Tap to scan it.`
                      }
                      className={`t3-contact${c.known ? ' is-known' : ''}${c.known && c.exposed === 0 ? ' is-held' : ''}${sel?.kind === 'contact' && sel.id === c.id ? ' is-on' : ''}${dwell === c.id ? ' is-dwell' : ''} t3-fav-${c.favor}`}
                      onClick={tapped(() => {
                        setSel(sel?.kind === 'contact' && sel.id === c.id ? null : { kind: 'contact', id: c.id })
                        play('soft-tick')
                      })}
                    >
                      <SignatureGlyph id={c.id} size={30} named={c.known} />
                      {c.known ? (
                        <span>
                          {c3.TAG[c.id] ?? shortName(c.def)} <i>{dots(c.strength)}</i>
                        </span>
                      ) : (
                        <span className="t3-q">?</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
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

      {drag && drag.kind !== 'link' && drag.kind !== 'burn' && (
        <div className={`t3-ghost t3-ghost-${drag.kind}${drag.over ? ' is-ok' : ''}`} style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }} aria-hidden="true">
          <span>{drag.label}</span>
        </div>
      )}

      <div ref={topRef} className="t3-top">
        <button type="button" className="t3-round" data-t3-menu aria-label={c3.SYSTEM} aria-expanded={sheet} onClick={() => setSheet(true)}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <div className="t3-where">
          <b data-t3-night>{mode === 'briefing' ? 'DARK CONSTELLATION' : `${daily ? `${c3.dailyTag(daily.n)} · ` : ''}${c3.nightOf(turnShown, totalTurns)}`}</b>
          <span data-t3-phaseline>{phaseLine}</span>
        </div>
        {phase !== 'opening' && (
          <div className="t3-meters">
            <div className={`t3-meter t3-meter-score${phase === 'dawn' ? ' is-big' : ''}${hud.score < line ? ' is-under' : ''}`} data-t3-score aria-label={`Mission assurance score ${hud.score.toFixed(1)}. ${c3.winLine(line)}.`}>
              <span>{c3.SCORE}</span>
              <b>{score.toFixed(1)}</b>
              <span className="t3-line" aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
                <u style={{ left: `${line}%` }} />
              </span>
              <small>{c3.winLine(line)}</small>
            </div>
            <div className="t3-meter" data-t3-budget aria-label={`Budget ${Math.round(phase === 'plan' && stakes ? stakes.remaining : hud.credits)} CR`}>
              <span>{c3.BUDGET}</span>
              <b>
                {Math.round(credits)}
                <small> CR</small>
              </b>
            </div>
          </div>
        )}
      </div>

      <p className="t3-sr" role="status" aria-live="polite">
        {say}
      </p>

      <div ref={dockRef} className={`t3-dock${anchorId && wide ? ' is-anchored' : ''}`} data-t3-dock>
        {guide && (phase === 'plan' || phase === 'night' || phase === 'dawn') && (
          <p className="t3-coach" data-t3-guide={guide} role="status">
            <span>{c3.GUIDE[guide]}</span>
            <button
              type="button"
              data-t3-guide-skip
              onClick={() => {
                setGuide(null)
                setPf(setPrefs({ guideSeen: true }))
              }}
            >
              {c3.GUIDE_SKIP}
            </button>
          </p>
        )}

        {phase === 'opening' && (
          <Opening
            world={world}
            reduced={reduced}
            polar={pf.opening === 'polar' && unlocksFor(progress(), dossier().size).openings.polar}
            play={play}
            onDone={() => {
              world.current?.setShot(null)
              if (mode === 'briefing') return leave()
              markIntroSeen()
              setPhase('plan')
            }}
          />
        )}

        {showPlanHome && stakes && (
          <div className="t3-card t3-plan" key={`brief-${game.turn}`} data-t3-card="plan">
            <p className="t3-eyebrow">
              WATCH OFFICER · {c3.nightOf(game.turn, totalTurns)}
              {game.posture === 'dark' ? ' · RUNNING DARK' : ''}
            </p>
            <p className="t3-lead">{intro}</p>
            {note ? <p className="t3-note">{note}</p> : <p className="t3-hint">{contacts.every((c) => c.known) && contacts.some((c) => !c.fixed) && orders.scans.length === 0 ? c3.ALLIED_FEED : c3.scanHint(tracks, contacts.length)}</p>}
            <div className="t3-stakes" data-t3-stakes>
              <p>
                <span>{c3.AT_STAKE}</span>
                <b className={stakes.atStake < -0.05 ? 't3-bad' : 't3-ok'}>{c3.upTo(stakes.atStake)}</b>
              </p>
              <p title={c3.worstNote(stakes.worst)}>
                <span>{c3.WORST}</span>
                <b className={stakes.worst < 0 ? 't3-bad' : ''}>{stakes.worst} CR</b>
              </p>
              <button
                type="button"
                className={`t3-lens${scan.left === 0 ? ' is-out' : ''}`}
                data-t3-lens
                aria-label={`${c3.SCAN}. ${c3.pulsesLeft(scan.left, scan.pulses)}. Drag it over a signature, or tap a signature.`}
                onPointerDown={scan.left > 0 ? (e) => startDrag(e, 'scan', 'lens', c3.SCAN) : undefined}
                onClick={tapped(() => {
                  const next = contacts.find((c) => !c.known)
                  if (next) setSel({ kind: 'contact', id: next.id })
                })}
              >
                <span>{c3.SCAN}</span>
                <b aria-hidden="true">
                  {'◉'.repeat(scan.left)}
                  {'○'.repeat(scan.pulses - scan.left)}
                </b>
              </button>
            </div>
          </div>
        )}

        {deciding && selContact && (
          <ContactCard
            contact={selContact}
            sign={signs.get(selContact.targetId ?? '') ?? 'the fleet'}
            track={selContact.slot + 1}
            tracks={tracks}
            siblings={contacts.filter((c) => c.slot === selContact.slot).length}
            scanLeft={scan.left}
            filed={dossier().has(selContact.id)}
            answers={selContact.known ? answersFor(selContact) : []}
            locked={ownedName}
            onScan={() => void doScan(selContact.id)}
            onPlace={(id) => place(id, orders.defense === id ? undefined : selContact.targetId)}
            onClose={() => setSel(null)}
          />
        )}
        {deciding && selAsset && (
          <AssetCard
            asset={selAsset}
            sign={signs.get(selAsset.id) ?? selAsset.id}
            contacts={contactsOn(selAsset.id)}
            conditions={conds.get(selAsset.id) ?? []}
            modules={modulesOn(selAsset.id)}
            onContact={(id) => setSel({ kind: 'contact', id })}
            onClose={() => setSel(null)}
          />
        )}
        {deciding && selPiece && (
          <PieceCard
            piece={selPiece}
            targets={[...game.assets]
              .filter((a) => a.integrity > 0 && selPiece.domain.includes(a.kind))
              .sort((a, b) => Number(selPiece.answers.some((x) => x.contact.targetId === b.id)) - Number(selPiece.answers.some((x) => x.contact.targetId === a.id)))
              .map((a) => ({ id: a.id, sign: signs.get(a.id) ?? a.id }))}
            locked={orders.defense && orders.defense !== selPiece.cm.id ? PIECE[orders.defense] : null}
            upkeep={game.scenario.upkeepPerDefense}
            onPlace={(assetId) => place(selPiece.cm.id, assetId)}
            onRemove={() => place(selPiece.cm.id)}
            onClose={() => setSel(null)}
          />
        )}
        {deciding && sel?.kind === 'fleet' && (
          <FleetCard fleet={fleet} signs={Object.fromEntries(orders.assets.map((k, i) => [k, cartSigns[i]])) as Partial<Record<AssetKind, string>>} onToggle={toggleAsset} onClose={() => setSel(null)} />
        )}

        {deciding && (
          <>
            <Tray
              kit={kit}
              fleetOrdered={orders.assets.length}
              selected={sel?.kind === 'piece' ? sel.id : sel?.kind === 'fleet' ? 'fleet' : null}
              onPick={(id) => {
                if (swallow.current) return
                setSel(sel?.kind === 'piece' && sel.id === id ? null : { kind: 'piece', id })
                play('soft-tick')
              }}
              onFleet={() => setSel(sel?.kind === 'fleet' ? null : { kind: 'fleet' })}
              startDrag={(e, id, label) => startDrag(e, 'piece', id, label)}
            />
            <div className="t3-go">
              {atRisk && stakes && stakes.worst < 0 ? (
                <p className="t3-riskline" role="alert" data-t3-risk>
                  {c3.riskLine(stakes.worst)}
                </p>
              ) : (
                <p data-t3-order-line>{c3.orderLine(ownedName, orders.assets.length, orders.scans.length)}</p>
              )}
              <button type="button" data-t3-begin data-t3-worst={stakes?.worst} className={`t3-btn t3-primary${atRisk && stakes && stakes.worst < 0 ? ' t3-risk' : ''}`} onClick={begin}>
                {atRisk && stakes && stakes.worst < 0 ? c3.BEGIN_AT_RISK : c3.BEGIN}
              </button>
            </div>
          </>
        )}

        {phase === 'night' && stage.at === 'fall' && (
          <div className="t3-card t3-banner" key="fall">
            <p className="t3-eyebrow t3-bad">{copy.MOVING}</p>
            <p className="t3-lead">{c3.NIGHT_FALLS}</p>
            {now && now.night.pressed.length > 0 && <p className="t3-hint t3-warn">{c3.pressed(now.night.pressed.join(', '), tenth(maiScore(now.night.opening) - maiScore(game)))}</p>}
          </div>
        )}

        {phase === 'night' && step && (stage.at === 'launch' || stage.at === 'land' || stage.at === 'impact') && step.kind === 'threat' && (
          <StrikeBanner
            step={step}
            sign={signs.get(step.ev.targetAssetId ?? '') ?? ''}
            landing={stage.at === 'land'}
            tapOn={tapOpen}
            assist={assist}
            chain={step.def.id === 'blackout-chain'}
            used={step.ev.room !== undefined && !step.ev.response && (step.ev.answered ?? 0) > 0}
            onTap={() => world.current?.tap()}
          />
        )}
        {phase === 'night' && step && step.kind === 'debris' && (stage.at === 'launch' || stage.at === 'land' || stage.at === 'impact') && (
          <div className="t3-card t3-banner" key={`deb-${stage.i}`}>
            <p className="t3-eyebrow t3-warn">{copy.conjunctionHeader(game.turn).replace('TURN', 'NIGHT')}</p>
            <p className="t3-lead">
              <SignatureGlyph id="debris-conjunction" size={28} /> Debris crossing the orbit of {signs.get(step.ev.targetAssetId ?? '') ?? 'the fleet'}
            </p>
          </div>
        )}

        {phase === 'night' && stage.at === 'choose' && step && (
          <ChoiceCard
            step={step}
            choices={choices}
            sign={signs.get(step.ev.targetAssetId ?? '') ?? ''}
            credits={step.before.credits}
            chain={step.ev.chainBonus > 0 && chainArmed(step.before)}
            first={primary}
            onRespond={(id) => {
              if (!swallow.current) respond(id)
            }}
            startDrag={(e, id, label) => startDrag(e, 'response', id, label)}
          />
        )}
        {phase === 'night' && stage.at === 'call' && step && <CallCard turn={game.turn} terms={callTerms(step.before, step.ev)} first={primary} onCall={call} />}

        {phase === 'night' && stage.at === 'result' && step && now && (
          <ResultCard
            step={step}
            sign={signs.get(step.ev.targetAssetId ?? '') ?? ''}
            signs={signs}
            fresh={!filed && step.kind !== 'opportunity' && !dossier().has(step.def.id)}
            filed={filed}
            open={openCard}
            onOpen={() => setOpenCard((o) => !o)}
            last={stage.i + 1 >= now.night.steps.length}
            first={primary}
            could={step.kind !== 'threat' || step.ev.response || step.ev.room === undefined ? undefined : choicesFor(game, orders, inputs, stage.i, step).find((c) => c.id !== null && c.fits)}
            onContinue={onward}
          />
        )}

        {phase === 'dawn' && last && <DawnCard before={last.before} night={last.night} after={last.after} signs={callSigns(last.after)} first={primary} onNext={nextTurn} />}

        {phase === 'replay' && (
          <ReplayDock state={game} world={world} reduced={reduced} play={play} onBack={() => setPhase('debrief')} />
        )}
      </div>

      {phase === 'debrief' && (
          <Debrief
          state={game}
          daily={daily}
          standing={standing}
          earned={earned}
          run={run}
          reduced={reduced}
          play={play}
          onReplay={() => setPhase('replay')}
          onDossier={() => setRoom({})}
          onAgain={again}
          onExit={leave}
        />
      )}

      {sheet && (
          <SystemSheet
          prefs={pf}
          state={game}
          daily={daily}
          playing={mode === 'play' && game.status === 'playing'}
          onPrefs={(next) => setPf(setPrefs(next))}
          onGuide={() => {
            setPf(setPrefs({ guideSeen: false }))
            setGuide(phase === 'plan' ? 'scan' : null)
            setSheet(false)
          }}
          onDossier={() => {
            setSheet(false)
            setRoom({})
          }}
          onClose={() => setSheet(false)}
          onExit={leave}
        />
      )}
      {room && (
        <DossierRoom focus={room.focus} onBack={() => setRoom(null)} backLabel="BACK" />
      )}
    </div>
  )
}
