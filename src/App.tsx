// Top-level shell (R3.5, extended R4). The experience layer around the
// game: intro, menu, reference screens, scoreboard, and the game itself,
// under the diegetic terminal chrome and CRT overlay. R4 adds refresh-safe
// resume: if an autosave exists on load, the app lands straight back in the
// game at the saved turn and phase. None of this touches the engine.

import { useState } from 'react'
import Game from './ui/Game'
import Glossary from './ui/Glossary'
import FieldManual from './ui/FieldManual'
import HowToPlay from './ui/HowToPlay'
import IntroSequence, { hasSeenIntro } from './ui/IntroSequence'
import MainMenu, { type MenuTarget } from './ui/MainMenu'
import Scoreboard from './ui/Scoreboard'
import TerminalChrome from './ui/TerminalChrome'
import { LocalStorageStore, type RestoredGame } from './persistence'

type Screen = 'intro' | 'menu' | 'game' | 'scoreboard' | 'howto' | 'manual' | 'glossary'

const STATUS: Record<Screen, string> = {
  intro: 'BOOT',
  menu: 'STANDBY',
  game: 'OPERATION ACTIVE',
  scoreboard: 'RECORDS',
  howto: 'REFERENCE',
  manual: 'REFERENCE',
  glossary: 'REFERENCE',
}

const store = new LocalStorageStore()

function App() {
  // An in-progress autosave, read once at startup, seeds refresh-safe
  // resume: the game mounts with it and lands on the saved turn and phase.
  const [gameInitial, setGameInitial] = useState<RestoredGame | null>(() => store.loadAutosave())
  const [screen, setScreen] = useState<Screen>(() => {
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
          </div>
        </div>
      )}
    </>
  )
}

export default App
