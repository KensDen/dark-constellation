// Top-level shell (R3.5, extended R4, split in v1.2 R0). The experience layer around the
// game: intro, menu, reference screens, scoreboard, and the game itself,
// under the diegetic terminal chrome and CRT overlay. R4 adds refresh-safe
// resume: if an autosave exists on load, the app lands straight back in the
// game at the saved turn and phase. None of this touches the engine.

import { Suspense, lazy, useState } from 'react'
import Game from './ui/Game'
import MainMenu, { type MenuTarget } from './ui/MainMenu'
import TerminalChrome from './ui/TerminalChrome'
import { hasSeenIntro } from './ui/introSeen'
import { LocalStorageStore, type RestoredGame } from './persistence'
import { useGestureUnlock } from './audio'

// SPLIT OUT OF THE INITIAL CHUNK (v1.2 R0, brief section 8). A player who
// opens the game and plays a turn downloads the menu and the board; every
// screen below is a detour most sessions never take, and the cold open is
// a detour every session takes at most once. Menu and Game stay static on
// purpose: they are the first thing anyone sees.
//
// The list is not written down anywhere else. tests/lazy-screens.spec.ts
// reads these declarations and proves that nothing reachable from main.tsx
// imports the same modules statically, which is what would quietly put
// them back in the initial chunk (principle 17).
// THE GLOSSARY JOINED THE SPLIT in the Round 1 fix batch. R0 left it out,
// and the guard is what proved it had to: Round 6e made the glossary an
// overlay inside Game rather than a route, so Game imported it statically
// and the module rode in the initial chunk whatever App declared. Game
// now lazy-loads the overlay's module too (it is an overlay, so nothing
// unmounts and the cart is untouched), and this declaration is the one
// the guard derives the requirement from.
const FieldManual = lazy(() => import('./ui/FieldManual'))
const HowToPlay = lazy(() => import('./ui/HowToPlay'))
const Credits = lazy(() => import('./ui/Credits'))
const Scoreboard = lazy(() => import('./ui/Scoreboard'))
const Glossary = lazy(() => import('./ui/Glossary'))
const IntroSequence = lazy(() => import('./ui/IntroSequence'))

// The dev-only sound board (brief section 7). import.meta.env.DEV folds to
// false in a production build, so the ternary collapses to null and Rollup
// drops the dynamic import with it: no chunk is emitted and none of the
// board reaches players. The battery checks the built output for the
// board's marker rather than trusting this comment.
const SoundBoard = import.meta.env.DEV ? lazy(() => import('./audio/SoundBoard')) : null

type Screen = 'intro' | 'menu' | 'game' | 'scoreboard' | 'howto' | 'manual' | 'glossary' | 'credits' | 'soundboard'

const STATUS: Record<Screen, string> = {
  intro: 'BOOT',
  menu: 'STANDBY',
  game: 'OPERATION ACTIVE',
  scoreboard: 'RECORDS',
  howto: 'REFERENCE',
  manual: 'REFERENCE',
  glossary: 'REFERENCE',
  credits: 'REFERENCE',
  soundboard: 'DEV',
}

// The chrome the app already speaks in, held for the moment a screen's
// chunk is in flight. Deliberately plain: a spinner would be the only
// animation in the game that says nothing about the mission, and on a warm
// cache this is on screen for a frame or two.
function ScreenLoading() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10 font-mono text-sm">
      <p className="text-phosphor">&gt; LOADING MODULE_</p>
      <p className="mt-2 text-ink-dim">Standby.</p>
    </main>
  )
}

const store = new LocalStorageStore()

function App() {
  // The audio context cannot start before a real gesture, so the whole app
  // arms one listener and the first tap anywhere unlocks it. Mounted here
  // rather than per screen: the gesture can land on any control, including
  // one that unmounts in the same moment.
  useGestureUnlock()
  // An in-progress autosave, read once at startup, seeds refresh-safe
  // resume: the game mounts with it and lands on the saved turn and phase.
  const [gameInitial, setGameInitial] = useState<RestoredGame | null>(() => store.loadAutosave())
  const [screen, setScreen] = useState<Screen>(() => {
    // The dev board's only entry point, and it costs the shipped game
    // nothing: SoundBoard is null in a production build, so this branch is
    // dead there and the menu never grows an item players would see.
    if (SoundBoard && typeof location !== 'undefined' && location.hash === '#soundboard') return 'soundboard'
    if (store.loadAutosave()) return 'game'
    return hasSeenIntro() ? 'menu' : 'intro'
  })

  const toMenu = () => {
    setGameInitial(null)
    setScreen('menu')
  }

  const onSelect = (t: MenuTarget) => {
    if (t === 'resume') {
      setGameInitial(store.loadAutosave())
      setScreen('game')
    } else if (t === 'game') {
      setGameInitial(null)
      setScreen('game')
    } else {
      setScreen(t)
    }
  }

  return (
    <>
      <div className="crt-overlay" aria-hidden="true" />
      {screen === 'intro' ? (
        <Suspense fallback={<ScreenLoading />}>
          <IntroSequence onDone={() => setScreen('menu')} />
        </Suspense>
      ) : (
        <div className={`${screen === 'game' ? 'h-dvh' : 'min-h-screen'} flex flex-col`}>
          {/* The board (v1.2 R1) fills the viewport under the terminal
              header and scrolls its own layer area, so the game screen's
              shell is bounded to the viewport; every other screen is a
              document that scrolls the page as before. */}
          <TerminalChrome status={STATUS[screen]} />
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {/* One boundary around every screen that arrives as a chunk, so
                a detour shows the same thing whichever one it is. Menu and
                Game render inside it and never suspend. */}
            <Suspense fallback={<ScreenLoading />}>
              {screen === 'menu' && <MainMenu onSelect={onSelect} resumeAvailable={!!store.loadAutosave()} />}
              {screen === 'game' && <Game key={gameInitial ? 'resume' : 'new'} initial={gameInitial} onExit={toMenu} />}
              {screen === 'scoreboard' && <Scoreboard onBack={toMenu} />}
              {screen === 'howto' && <HowToPlay onBack={toMenu} />}
              {screen === 'manual' && <FieldManual onBack={toMenu} />}
              {screen === 'glossary' && <Glossary onBack={toMenu} />}
              {screen === 'credits' && <Credits onBack={toMenu} />}
              {screen === 'soundboard' && SoundBoard && <SoundBoard onBack={toMenu} />}
            </Suspense>
          </div>
        </div>
      )}
    </>
  )
}

export default App
