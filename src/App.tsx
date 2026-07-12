import { GAME_TITLE } from './config'

function App() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">{GAME_TITLE}</h1>
      <p className="mt-4">
        Round 0 placeholder. This page exists to prove the deploy path.
        There is no game here yet.
      </p>
      <p className="mt-2">
        A turn-based space and drone cybersecurity strategy sim.
        All organizations, vendors, and threat actors in the fiction are original and fictional.
      </p>
    </main>
  )
}

export default App
