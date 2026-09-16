// Top-level shell (R3.5, extended R4). The experience layer around the
// game: intro, menu, reference screens, scoreboard, and the game itself,
// under the diegetic terminal chrome and CRT overlay. R4 adds refresh-safe
// resume: if an autosave exists on load, the app lands straight back in the
// game at the saved turn and phase. None of this touches the engine.

import { Suspense, lazy, useState } from 'react'
import Game from './ui/Game'
import Glossary from './ui/Glossary'
import FieldManual from './ui/FieldManual'
import HowToPlay from './ui/HowToPlay'
import IntroSequence, { hasSeenIntro } from './ui/IntroSequence'
import MainMenu, { type MenuTarget } from './ui/MainMenu'
import Scoreboard from './ui/Scoreboard'
import Credits from './ui/Credits'
import TerminalChrome from './ui/TerminalChrome'
import { LocalStorageStore, type RestoredGame } from './persistence'
import { useGestureUnlock } from './audio'

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
        <IntroSequence onDone={() => setScreen(hasSeenIntro() ? 'menu' : 'menu')} />
      ) : (
        <div className="min-h-screen flex flex-col">
          <TerminalChrome status={STATUS[screen]} />
          <div className="flex-1">
            {screen === 'menu' && <MainMenu onSelect={onSelect} resumeAvailable={!!store.loadAutosave()} />}
            {screen === 'game' && <Game key={gameInitial ? 'resume' : 'new'} initial={gameInitial} onExit={toMenu} />}
            {screen === 'scoreboard' && <Scoreboard onBack={toMenu} />}
            {screen === 'howto' && <HowToPlay onBack={toMenu} />}
            {screen === 'manual' && <FieldManual onBack={toMenu} />}
            {screen === 'glossary' && <Glossary onBack={toMenu} />}
            {screen === 'credits' && <Credits onBack={toMenu} />}
            {screen === 'soundboard' && SoundBoard && (
              <Suspense fallback={null}>
                <SoundBoard onBack={toMenu} />
              </Suspense>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default App
