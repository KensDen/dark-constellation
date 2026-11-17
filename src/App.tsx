// Top-level shell (R3.5, extended R4, split in v1.2 R0, the front door
// rebuilt in v1.3 R1). The experience layer around the game: the title,
// the briefing, the reference screens, the scoreboard, and the game.
//
// v2.0 R1 (Ken, 10 November 2026): the game is the 3D game. PLAY, CONTINUE,
// DAILY OP, a replayed seed and a pasted code all open it (./ui/three/Game3D,
// a deferred chunk), its opening is the briefing, and the title's DOSSIER
// opens its Dossier.
//
// v2.0 R3 (Ken's ruling of 15 November 2026): the pixel board is retired on
// this branch. Its screens, its briefing, its Dossier and the address that
// opened them are gone, and the 3D game is the only game. The pixel game is
// kept as it was on main, v1.7/r1 and exp/3d-slice.
//
// THE FLOW (v1.3 R1, brief 5.1 and section 3): a first-ever visit lands on
// the title; its first PLAY opens the 3D game on its briefing and goes on
// to night 1, with no menu in between, and starts on EASY. Later PLAYs go
// straight to night 1. PLAY draws a fresh random seed (M30); SYSTEM's
// Replay a seed takes a typed one. R4 kept refresh-safe resume: with an
// autosave on load, the app lands straight back in the game at the saved
// night and phase, and the title offers CONTINUE whenever one exists.

import { Suspense, lazy, useEffect, useLayoutEffect, useState } from 'react'
import Title from './ui/Title'
import { LocalStorageStore, SaveError, captureGame, decodeSaveCode, encodeSaveCode, type RestoredGame } from './persistence'
import { useGestureUnlock, useSoundPrefs } from './audio'
import { startDailyOp } from './ui/dailyOp'
import { chooseDifficulty, deviceDifficulty, newOperation, parseSeed } from './ui/session'
import { copyToClipboard } from './ui/clipboard'
import { usePageVisible } from './ui/cues/motion'
import type { Difficulty } from './engine/types'

// SPLIT OUT OF THE INITIAL CHUNK (v1.2 R0, brief section 8). A player who
// opens the game downloads the title; every screen below is a detour most
// sessions never take. The title stays static on purpose: it is the first
// thing anyone sees.
//
// The list is not written down anywhere else. tests/lazy-screens.spec.ts
// reads these declarations and proves that nothing reachable from main.tsx
// imports the same modules statically, which is what would quietly put
// them back in the initial chunk (principle 17).
const Credits = lazy(() => import('./ui/Credits'))
// The terminal chrome frames only these reference screens, never the title
// or the board, so it travels with them (v1.3 R1 fixes: moved out to keep
// INITIAL under 155,000 once the title's fixes landed).
const TerminalChrome = lazy(() => import('./ui/TerminalChrome'))
const Scoreboard = lazy(() => import('./ui/Scoreboard'))
// LIBRARY (v1.3 R4, brief 5.1): the Field Library with the Glossary as a
// tab, each tab a chunk of its own. The Field Library validates its list
// as it loads; a list that failed, or a chunk that never arrived, leaves a
// way back rather than a blank app, which is what a throw inside this
// Suspense would otherwise do.
const ScreenUnavailable = ({ onBack }: { onBack: () => void }) => (
  <main className="mx-auto max-w-[520px] px-4 py-10 font-mono text-sm">
    <p className="text-dc-warn">This screen could not load.</p>
    <button type="button" className="tt-btn mt-4" onClick={onBack}>
      BACK TO TITLE
    </button>
  </main>
)
const Library = lazy(() => import('./ui/Library').catch(() => ({ default: ScreenUnavailable })))
// THE 3D GAME (v2.0 R1): the whole operation in a 3D world, in a chunk of
// its own that shares one three.js with the title's constellation frame.
type Game3DProps = Parameters<(typeof import('./ui/three/Game3D'))['default']>[0]
const Game3D = lazy(() => import('./ui/three/Game3D').catch(() => ({ default: ({ onExit }: Game3DProps) => <ScreenUnavailable onBack={onExit} /> })))

// ?view=3d&seed=n opens the 3D game on a seed, for a capture or a share.
const seedInAddress = () => {
  try {
    return location.search.includes('view=3d') ? parseSeed(new URLSearchParams(location.search).get('seed') ?? '') : null
  } catch {
    return null
  }
}

// The dev-only sound board (brief section 7). import.meta.env.DEV folds to
// false in a production build, so the ternary collapses to null and Rollup
// drops the dynamic import with it: no chunk is emitted and none of the
// board reaches players. The battery checks the built output for the
// board's marker rather than trusting this comment.
const SoundBoard = import.meta.env.DEV ? lazy(() => import('./audio/SoundBoard')) : null

type Screen = 'title' | 'game3d' | 'library' | 'scoreboard' | 'credits' | 'soundboard'

// The terminal chrome frames the dev board only (v2.0 R4: the credits wear
// the game's bar, like the other reading rooms).
const STATUS: Partial<Record<Screen, string>> = {
  soundboard: 'DEV',
}

// The chrome the app already speaks in, held for the moment a screen's
// chunk is in flight. Deliberately plain: on a warm cache this is on
// screen for a frame or two.
function ScreenLoading() {
  return (
    <main className="mx-auto max-w-[520px] px-4 py-10 text-sm">
      <p className="tt-label">LOADING</p>
      <p className="tt-note mt-2">One moment.</p>
    </main>
  )
}

const store = new LocalStorageStore()

function App() {
  // The audio context cannot start before a real gesture, so the whole app
  // arms one listener and the first tap anywhere unlocks it.
  useGestureUnlock()
  // A hidden tab holds every animation on every screen where it is (brief
  // 8.3): one class on the root, which src/index.css turns into a pause.
  const visible = usePageVisible()
  useEffect(() => {
    document.documentElement.classList.toggle('dc-page-hidden', !visible)
  }, [visible])
  const [soundPrefs, setSoundPrefs] = useSoundPrefs()
  // A new mount of the game for every operation started, so nothing of
  // the last one carries over.
  const [gameKey, setGameKey] = useState(0)
  const [screen, setScreen] = useState<Screen>(() => {
    // The dev board's only entry point, and it costs the shipped game
    // nothing: SoundBoard is null in a production build.
    if (SoundBoard && typeof location !== 'undefined' && location.hash === '#soundboard') return 'soundboard'
    if (seedInAddress()) return 'game3d'
    return store.loadAutosave() ? 'game3d' : 'title'
  })
  // What the game opens on: an operation (an in-progress autosave, read
  // once at startup, seeds refresh-safe resume), its Dossier alone, or the
  // briefing replayed.
  const [g3, setG3] = useState<{ initial: RestoredGame | null; mode: 'play' | 'dossier' | 'briefing' }>(() => {
    const seed = seedInAddress()
    return { initial: seed ? newOperation(deviceDifficulty(), seed) : store.loadAutosave(), mode: 'play' }
  })
  const [difficulty, setDifficulty] = useState<Difficulty>(() => deviceDifficulty())
  // The title re-reads the device's difficulty each time it shows (R6
  // question 14): a first finished game moves the default from EASY to
  // STANDARD (ruling R2), and the title offers it without a reload.
  useEffect(() => {
    if (screen === 'title') setDifficulty(deviceDifficulty())
  }, [screen])
  const [notice, setNotice] = useState('')

  // Every screen opens at its top (Ken's iPhone, 21 October 2026: DOSSIER
  // opened the Glossary at the title's scroll position). Assigned rather
  // than scrollTo, which a test DOM lacks.
  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [screen])

  const start = (initial: RestoredGame) => {
    setGameKey((k) => k + 1)
    setNotice('')
    setG3({ initial, mode: 'play' })
    setScreen('game3d')
  }
  const room3d = (mode: 'dossier' | 'briefing') => {
    setGameKey((k) => k + 1)
    setG3({ initial: null, mode })
    setScreen('game3d')
  }
  const toTitle = () => setScreen('title')

  // The briefing is the game's own opening, in the world.
  const play = () => start(newOperation(difficulty))

  const resumable = store.loadAutosave()
  const resumeTurn = resumable && resumable.state.status === 'playing' ? Math.min(resumable.state.turn, resumable.state.scenario.totalTurns) : null

  const exportAutosave = resumable
    ? async () => {
        const code = encodeSaveCode(captureGame(resumable.state, resumable.phase, new Date().toISOString(), resumable.daily))
        setNotice((await copyToClipboard(code)) ? 'Save code copied to clipboard.' : 'Copy failed.')
      }
    : undefined

  const importCode = (code: string) => {
    try {
      start(decodeSaveCode(code))
    } catch (e) {
      setNotice(e instanceof SaveError ? e.message : 'That save code could not be read.')
    }
  }

  const chrome = screen in STATUS

  return (
    <>
      <div className="crt-overlay" aria-hidden="true" />
      <div className="min-h-screen flex flex-col">
        {/* Every screen is a document that scrolls the page; the game takes
            the viewport for itself (src/ui/three/game3d.css). Only the
            dev board carries the terminal chrome. */}
        {chrome && (
          <Suspense fallback={null}>
            <TerminalChrome status={STATUS[screen] ?? 'REFERENCE'} />
          </Suspense>
        )}
        <div data-screen={screen} className="flex-1 min-h-0 flex flex-col">
          <Suspense fallback={<ScreenLoading />}>
            {screen === 'title' && (
              <Title
                difficulty={difficulty}
                onDifficulty={(d) => {
                  chooseDifficulty(d)
                  setDifficulty(d)
                }}
                resumeTurn={resumeTurn}
                onContinue={() => {
                  if (resumable) start(resumable)
                }}
                onPlay={play}
                onDaily={() => start(startDailyOp(new Date()))}
                onBriefing={() => room3d('briefing')}
                onDossier={() => room3d('dossier')}
                onLibrary={() => setScreen('library')}
                staleSave={store.autosaveIsStale()}
                soundPrefs={soundPrefs}
                onSoundPrefs={setSoundPrefs}
                onExport={exportAutosave}
                onImport={importCode}
                onReplaySeed={(seed) => start(newOperation(difficulty, seed))}
                onScoreboard={() => setScreen('scoreboard')}
                onCredits={() => setScreen('credits')}
                notice={notice}
              />
            )}
            {screen === 'game3d' && <Game3D key={`${gameKey}`} initial={g3.initial} mode={g3.mode} onExit={toTitle} />}
            {screen === 'library' && <Library onBack={toTitle} />}
            {screen === 'scoreboard' && <Scoreboard onBack={toTitle} />}
            {screen === 'credits' && <Credits onBack={toTitle} />}
            {screen === 'soundboard' && SoundBoard && <SoundBoard onBack={toTitle} />}
          </Suspense>
        </div>
      </div>
    </>
  )
}

export default App
