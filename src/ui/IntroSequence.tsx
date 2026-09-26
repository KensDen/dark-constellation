// Intro sequence (R3.5): full-bleed slides with a SKIP control and a
// localStorage seen-flag so returning players land straight on the menu.
// The flag lives in ./introSeen: App reads it on startup and must not
// import this module to do so, or the cold open rejoins the initial chunk
// (v1.2 R0).
// Ships with one slide (intro-vortex). Text is original; no wording from
// any existing game.

import { useEffect, useState } from 'react'
import { ADVERSARY, CONSTELLATION, PLAYER_ORG, SQUADRON } from '../config'
import Wordmark from './Wordmark'
import introVortex from './assets/intro-vortex.webp'
import { markIntroSeen } from './introSeen'


interface Slide {
  image: string
  lines: string[]
}

const SLIDES: Slide[] = [
  {
    image: introVortex,
    lines: [
      `${PLAYER_ORG} is standing up ${CONSTELLATION} and the ${SQUADRON} squadron for a disaster-response tasking.`,
      `A threat group called ${ADVERSARY} has taken an interest.`,
      'You are the mission assurance architect. The constellation goes dark if you let it.',
    ],
  },
]

export default function IntroSequence({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0)

  const finish = () => {
    markIntroSeen()
    onDone()
  }

  const next = () => {
    if (index + 1 < SLIDES.length) setIndex(index + 1)
    else finish()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  const slide = SLIDES[index]

  return (
    <div className="fixed inset-0 z-40 bg-base flex flex-col">
      <div
        className="relative flex-1 flex items-end justify-center bg-center bg-cover"
        style={{ backgroundImage: `url(${slide.image})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-base via-base/60 to-base/20" />
        <div className="relative max-w-3xl w-full px-6 pb-10 sm:pb-16">
          <Wordmark size="clamp(1rem, 4.4vw, 2rem)" />
          <div className="mt-4 space-y-2">
            {slide.lines.map((line, i) => (
              <p key={i} className="font-mono text-sm sm:text-base text-ink">
                {line}
              </p>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-3">
            <button
              className="font-mono border border-phosphor/60 text-phosphor px-4 py-1.5 hover:bg-phosphor/10"
              onClick={next}
            >
              {index + 1 < SLIDES.length ? 'Continue' : 'Begin'}
            </button>
            <button className="font-mono text-ink-dim px-2 py-1.5 hover:text-phosphor" onClick={finish}>
              Skip [Esc]
            </button>
            <span className="ml-auto font-mono text-xs text-ink-dim">
              {index + 1} / {SLIDES.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
