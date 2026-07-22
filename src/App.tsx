// Top-level shell (R3.5): the experience layer around the game. An intro
// sequence (once), a main menu, the reference screens, and the game itself,
// all under the diegetic terminal chrome and an optional CRT overlay. None
// of this touches the engine: the game logic and its determinism are
// unchanged.

import { useState } from 'react'
import Game from './ui/Game'
import Glossary from './ui/Glossary'
import FieldManual from './ui/FieldManual'
import HowToPlay from './ui/HowToPlay'
import IntroSequence, { hasSeenIntro } from './ui/IntroSequence'
import MainMenu, { type MenuTarget } from './ui/MainMenu'
import TerminalChrome from './ui/TerminalChrome'

type Screen = 'intro' | 'menu' | MenuTarget

const STATUS: Record<Screen, string> = {
  intro: 'BOOT',
  menu: 'STANDBY',
  game: 'OPERATION ACTIVE',
  howto: 'REFERENCE',
  manual: 'REFERENCE',
  glossary: 'REFERENCE',
}

function App() {
  const [screen, setScreen] = useState<Screen>(() => (hasSeenIntro() ? 'menu' : 'intro'))
  const toMenu = () => setScreen('menu')

  return (
    <>
      <div className="crt-overlay" aria-hidden="true" />
      {screen === 'intro' ? (
        <IntroSequence onDone={toMenu} />
      ) : (
        <div className="min-h-screen flex flex-col">
          <TerminalChrome status={STATUS[screen]} />
          <div className="flex-1">
            {screen === 'menu' && <MainMenu onSelect={setScreen} />}
            {screen === 'game' && <Game onExit={toMenu} />}
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
