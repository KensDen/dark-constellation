// Top-level shell (R3.5, extended R4, split in v1.2 R0, the front door
// rebuilt in v1.3 R1). The experience layer around the game: the title,
// the briefing, the reference screens, the scoreboard, and the game.
//
// THE FLOW (v1.3 R1, brief 5.1 and section 3): a first-ever visit lands on
// the title; its first PLAY goes through the briefing and on to turn 1,
// with no menu in between, and starts on EASY. Later PLAYs go straight to
// turn 1. PLAY draws a fresh random seed (M30); SYSTEM's Replay a seed
// takes a typed one. R4 kept refresh-safe resume: with an autosave on
// load, the app lands straight back in the game at the saved turn and
// phase, and the title offers CONTINUE TURN n whenever one exists.

import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Game from './ui/Game'
import Title from './ui/Title'
import { hasSeenIntro } from './ui/introSeen'
import { LocalStorageStore, SaveError, captureGame, decodeSaveCode, encodeSaveCode, type RestoredGame } from './persistence'
import { useGestureUnlock, useSoundPrefs } from './audio'
import { startDailyOp } from './ui/dailyOp'
import { chooseDifficulty, deviceDifficulty, newOperation } from './ui/session'
import { copyToClipboard } from './ui/clipboard'
import { usePageVisible } from './ui/cues/motion'
import type { Difficulty } from './engine/types'

// SPLIT OUT OF THE INITIAL CHUNK (v1.2 R0, brief section 8). A player who
// opens the game and plays a turn downloads the title and the board; every
// screen below is a detour most sessions never take, and the briefing is a
// detour every device takes at most once unless asked. Title and Game stay
// static on purpose: they are the first thing anyone sees.
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
    <button type="button" className="mt-4 min-h-11 border-2 border-dc-line bg-dc-panel px-3 font-display text-[10px] text-dc-ink" onClick={onBack}>
      BACK TO TITLE
    </button>
  </main>
)
const Library = lazy(() => import('./ui/Library').catch(() => ({ default: ScreenUnavailable })))
// THE COLDVEIL DOSSIER (v1.3 R4, brief 5.7): the title's DOSSIER and GOAL 2.
const Dossier = lazy(() => import('./ui/Dossier').catch(() => ({ default: ScreenUnavailable })))
const IntroSequence = lazy(() => import('./ui/IntroSequence'))

// The dev-only sound board (brief section 7). import.meta.env.DEV folds to
// false in a production build, so the ternary collapses to null and Rollup
// drops the dynamic import with it: no chunk is emitted and none of the
// board reaches players. The battery checks the built output for the
// board's marker rather than trusting this comment.
const SoundBoard = import.meta.env.DEV ? lazy(() => import('./audio/SoundBoard')) : null

type Screen = 'title' | 'briefing' | 'game' | 'library' | 'dossier' | 'scoreboard' | 'credits' | 'soundboard'

// The terminal chrome frames the credits and the dev board only. The
// screens R4 rebuilt (LIBRARY, the Dossier, the scoreboard) carry the
// game's own bar instead.
const STATUS: Partial<Record<Screen, string>> = {
  credits: 'REFERENCE',
  soundboard: 'DEV',
}

// The chrome the app already speaks in, held for the moment a screen's
// chunk is in flight. Deliberately plain: on a warm cache this is on
// screen for a frame or two.
function ScreenLoading() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 font-mono text-sm">
      <p className="text-phosphor">&gt; LOADING_</p>
      <p className="mt-2 text-ink-dim">Standby.</p>
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
  // An in-progress autosave, read once at startup, seeds refresh-safe
  // resume: the game mounts with it and lands on the saved turn and phase.
  const [gameInitial, setGameInitial] = useState<RestoredGame | null>(() => store.loadAutosave())
  // A new mount of Game for every operation started, so nothing of the
  // last one carries over.
  const [gameKey, setGameKey] = useState(0)
  const [screen, setScreen] = useState<Screen>(() => {
    // The dev board's only entry point, and it costs the shipped game
    // nothing: SoundBoard is null in a production build.
    if (SoundBoard && typeof location !== 'undefined' && location.hash === '#soundboard') return 'soundboard'
    return store.loadAutosave() ? 'game' : 'title'
  })
  const [difficulty, setDifficulty] = useState<Difficulty>(() => deviceDifficulty())
  // The briefing either leads into an operation (a first PLAY) or is a
  // replay from the title.
  const [briefingNext, setBriefingNext] = useState<RestoredGame | null>(null)
  const [notice, setNotice] = useState('')

  // Every screen opens at its top (Ken's iPhone, 21 October 2026: DOSSIER
  // opened the Glossary at the title's scroll position). The page scrolls
  // for every screen but the board, which scrolls its own layer, so both
  // are reset; assigned rather than scrollTo, which a test DOM lacks.
  const scroller = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    if (scroller.current) scroller.current.scrollTop = 0
  }, [screen])

  const start = (initial: RestoredGame) => {
    setGameInitial(initial)
    setGameKey((k) => k + 1)
    setNotice('')
    setScreen('game')
  }
  const toTitle = () => {
    setGameInitial(null)
    setScreen('title')
  }

  const play = () => {
    const op = newOperation(difficulty)
    if (hasSeenIntro()) start(op)
    else {
      setBriefingNext(op)
      setScreen('briefing')
    }
  }

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
      {screen === 'briefing' ? (
        <Suspense fallback={<ScreenLoading />}>
          <IntroSequence
            replay={briefingNext === null}
            onDone={() => {
              const next = briefingNext
              setBriefingNext(null)
              if (next) start(next)
              else setScreen('title')
            }}
          />
        </Suspense>
      ) : (
        <div className={`${screen === 'game' ? 'h-dvh' : 'min-h-screen'} flex flex-col`}>
          {/* The board fills the viewport and scrolls its own layer area,
              so the game screen's shell is bounded to the viewport; every
              other screen is a document that scrolls the page. Only the
              credits and the dev board carry the terminal chrome. */}
          {chrome && (
            <Suspense fallback={null}>
              <TerminalChrome status={STATUS[screen] ?? 'REFERENCE'} />
            </Suspense>
          )}
          <div ref={scroller} data-screen={screen} className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col">
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
                  onBriefing={() => {
                    setBriefingNext(null)
                    setScreen('briefing')
                  }}
                  onDossier={() => setScreen('dossier')}
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
              {screen === 'game' && (
                <Game
                  key={`${gameKey}`}
                  initial={gameInitial}
                  onExit={toTitle}
                  onScoreboard={() => {
                    setGameInitial(null)
                    setScreen('scoreboard')
                  }}
                  onCredits={() => {
                    setGameInitial(null)
                    setScreen('credits')
                  }}
                />
              )}
              {screen === 'library' && <Library onBack={toTitle} />}
              {screen === 'dossier' && <Dossier onBack={toTitle} />}
              {screen === 'scoreboard' && <Scoreboard onBack={toTitle} />}
              {screen === 'credits' && <Credits onBack={toTitle} />}
              {screen === 'soundboard' && SoundBoard && <SoundBoard onBack={toTitle} />}
            </Suspense>
          </div>
        </div>
      )}
    </>
  )
}

export default App
