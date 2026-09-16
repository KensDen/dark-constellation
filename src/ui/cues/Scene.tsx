// The four cinematic scenes (Round 5, brief v1.3 section 6 rows flagged
// cinematicInRound5). Each replaces a baseline one-shot class with a
// structure the player can read.
//
// REDUCED MOTION IS DESIGNED HERE, NOT SUBTRACTED. Each scene renders the
// same INFORMATION in both modes and differs only in how it arrives: the
// blacked-out layer is already dark rather than fading to dark, the ribbon
// is in place rather than dropping, the recap is listed rather than
// washing in. Round 4e is the reason this is stated rather than assumed:
// the refusal cue there shipped through a motion-only class and did
// nothing at all for a reduced-motion player, in the round that made
// reduced motion a first-class path. A scene whose static form is "the
// animation, minus the animation" is that bug again.

import type { GameState, Layer, TechniqueRef } from '../../engine/types'
import { maiScore } from '../../engine/scoring'
import type { Beat } from '../../director/types'
import type { SceneName } from '../../director/cues'
import { layerBadges } from './icons'
import { useCueClass } from './motion'
import { useEffect, useState } from 'react'
import Readout from './Meter'

// The registry owns the name; this module owns the rendering. Aliased so
// the two cannot drift into different unions.
export type SceneKind = SceneName

// Which scene a beat plays, or null for the baseline treatment. Keyed on
// what the beat IS: the outcome half reads beat.lost rather than matching
// the title, which is finding 3.10 and the reason this round could not
// have shipped the scenes without it.
export function sceneFor(beat: Beat | null): SceneKind | null {
  if (!beat) return null
  if (beat.kind === 'outcome') return beat.lost === true ? 'defeat' : 'victory'
  if (beat.kind === 'commendation') return 'commendation'
  if (beat.kind === 'chain-armed') return 'blackout'
  if (beat.kind === 'threat' && beat.subjectId === 'blackout-chain') return 'blackout'
  return null
}

const LAYERS: Layer[] = ['ORBIT', 'AIR', 'GROUND']

// How many recap cards the loss screen shows. The reading diet bounds what
// the player is asked to take in, and a twelve turn campaign can fire two
// dozen techniques; the most recent are the ones that ended it.
// A value that ARRIVES, so a readout mounted at its final number still
// counts to it.
//
// useCountUp seeds both its state and its ref from the target and returns
// early when the two agree, so it animates only when an already-mounted
// readout is given a NEW value. Both scene readouts are fresh mounts at
// the instant their number first exists, so neither ever counted: the
// commendation bonus and the final MAI were painted at their final values
// in the first frame, in both motion modes, while the brief's rows ask in
// so many words for "bonus credits count up" and "final MAI sweep; score
// count-up". Holding zero for the first commit is what turns a mount into
// a change.
//
// Under reduced motion useCountUp snaps, so the number is simply correct
// from the first frame the player can perceive.
export function useArrivingValue(target: number, reduced: boolean): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    setValue(target)
  }, [target])
  // Under the preference there is no count to start, so there is no reason
  // to hold zero for a commit: the effect that adopts the target runs
  // after paint, so holding it would show the player a zero frame before
  // the real number. Reduced motion means the number arrives correct, not
  // that it arrives late.
  return reduced ? target : value
}

export const RECAP_MAX = 6

// Every technique that actually landed during the campaign, most recent
// first and each listed once. Derived from the engine's own record rather
// than from the deck, so a technique that was mitigated to nothing does
// not appear in the list of what beat you.
export function recapTechniques(state: GameState): TechniqueRef[] {
  const seen = new Set<string>()
  const out: TechniqueRef[] = []
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    for (const ev of state.history[i].events) {
      for (const ref of ev.firedTechniqueRefs) {
        if (seen.has(ref.id)) continue
        seen.add(ref.id)
        out.push(ref)
        if (out.length >= RECAP_MAX) return out
      }
    }
  }
  return out
}

// The scene marker, so a test can ask which scene is on screen rather than
// inferring it from a class that several treatments share.
export const SCENE_ATTR = 'data-scene'

export interface SceneProps {
  kind: SceneKind
  beat: Beat
  // The state as playback has presented it so far, which is what the
  // beat-local numbers read.
  presented: GameState
  // The engine's real after-state. The defeat recap is about the CAMPAIGN
  // rather than about this beat, and the presented state cannot answer it:
  // the shadow ledger copies only what a patch can touch, so its history
  // is the before-state's and is one turn short of the turn that ended the
  // run. Reading it there listed the wrong techniques entirely.
  final: GameState
  reduced: boolean
}

export default function Scene({ kind, beat, presented, final, reduced }: SceneProps) {
  // One trigger for every scene's entrance, so a scene cannot animate
  // under the preference by accident.
  const enter = useCueClass(beat.id, `dc-scene-${kind}`, reduced, 0)

  // The number this scene counts to, if it has one. Computed here rather
  // than inside a branch, because hooks cannot live behind a condition.
  const arriving = useArrivingValue(
    kind === 'commendation' ? (beat.patch.credits ?? 0) : kind === 'victory' ? maiScore(presented) : 0,
    reduced,
  )

  if (kind === 'blackout') {
    // The layers the BEAT says went dark, not a fixed three. The scene
    // listed ORBIT, AIR and GROUND struck through whatever happened, so it
    // contradicted the card three lines above it, which renders the beat's
    // own layer badges: the chain event carries AIR alone, and a player
    // with no drones saw the same three glyphs die. A beat that names no
    // layer means the whole constellation, which is what the armed chain
    // is.
    const darkened = beat.layers && beat.layers.length > 0 ? beat.layers : LAYERS
    const verdict =
      darkened.length === LAYERS.length
        ? 'Navigation, timing and downlink lost together. The drones are flying blind.'
        : `${darkened.join(' and ')} is flying blind: navigation and timing are gone.`
    // The brief's row: screen darkens, drone icons grey out, the sensor
    // icon flickers then dies, verdict line. Under reduce every layer is
    // rendered already dark with its label, which is the same statement
    // without the sequence.
    return (
      <div {...{ [SCENE_ATTR]: kind }} className={`mt-3 border border-hero-magenta/50 bg-void/60 p-3 ${enter}`}>
        <p className="font-mono text-xs uppercase tracking-widest text-hero-magenta">Constellation dark</p>
        <ul className="mt-2 flex gap-4">
          {darkened.map((layer) => (
            <li key={layer} className="flex flex-col items-center gap-1">
              <img
                src={layerBadges[layer]}
                alt=""
                aria-hidden="true"
                className={`w-6 h-6 opacity-25 grayscale ${reduced ? '' : 'dc-scene-die'}`}
              />
              <span className="font-mono text-[10px] text-ink-dim line-through">{layer}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 font-mono text-xs text-ink-dim">{verdict}</p>
      </div>
    )
  }

  if (kind === 'commendation') {
    // Ribbon drops in; bonus credits count up. Under reduce the ribbon is
    // in place and the number is its final value, which useCountUp already
    // does when the preference is set.
    const bonus = beat.patch.credits ?? 0
    return (
      <div {...{ [SCENE_ATTR]: kind }} className={`mt-3 border border-hero-blue/60 bg-hero-blue/5 p-3 ${enter}`}>
        <p className="font-mono text-xs uppercase tracking-widest text-hero-blue">Commendation</p>
        <p className="mt-1 font-mono text-sm text-ink">{beat.title}</p>
        {bonus > 0 && (
          <div className="mt-2 max-w-[12rem]">
            {/* No key needed here: DirectorView keys the whole Scene on
                the beat, so this readout is a fresh mount every beat along
                with the arriving value that feeds it. A key here alone did
                NOT fix the carry-over, because the stale number lives in
                this component's parent. */}
            <Readout label="Bonus credits" value={arriving} />
          </div>
        )}
      </div>
    )
  }

  if (kind === 'victory') {
    // Final MAI sweep and score count-up. The save code itself stays on
    // the report card that follows; duplicating it here would put the same
    // string on two screens and spend the reading budget twice.
    return (
      <div {...{ [SCENE_ATTR]: kind }} className={`mt-3 border border-phosphor/60 bg-phosphor/5 p-3 ${enter}`}>
        <p className="font-mono text-xs uppercase tracking-widest text-phosphor">Mission assured</p>
        <div className="mt-2 max-w-[16rem]">
          {/* The Mission Assurance Index, which is the number the whole
              campaign is played against. Written as linkAvailability at
              first, which is one of the three meters MAI is computed from
              and not the score itself: the scene would have shown a real
              number under the wrong name. */}
          {/* No key here, unlike the commendation readout. A turn derives
              at most one outcome beat and the view shows one beat at a
              time, so two outcome scenes can never be adjacent and there
              is nothing for a key to prevent; a mutation removing it
              cannot be caught because the behaviour cannot occur. Dead
              defensiveness is removed rather than tested (Round 4b). */}
          <Readout label="Final MAI" value={arriving} max={100} />
        </div>
        <p className="mt-2 font-mono text-xs text-ink-dim">Save code and full report on the next screen.</p>
      </div>
    )
  }

  // Defeat: a static wash to LINK LOST, then the technique recap. Under
  // reduce the wash is not rendered at all and LINK LOST is simply there,
  // rather than a wash held at its final frame.
  //
  // The recap comes from the CAMPAIGN, not from the beat. The outcome beat
  // carries no techniques of its own, so reading beat.techniques rendered
  // an empty list every time and the row's named treatment shipped as
  // nothing at all. What the player wants to see is what actually hit them
  // over twelve turns, which is what the history holds.
  const techniques = recapTechniques(final)
  return (
    <div {...{ [SCENE_ATTR]: kind }} className={`relative mt-3 border border-hero-magenta/60 bg-void/70 p-3 ${enter}`}>
      {!reduced && <span aria-hidden="true" className="dc-scene-wash absolute inset-0" />}
      <p className="relative font-mono text-xs uppercase tracking-widest text-hero-magenta">Link lost</p>
      <p className="relative mt-1 font-mono text-sm text-ink">{beat.title}</p>
      {techniques.length > 0 && (
        <ul className="relative mt-2 flex flex-wrap gap-1.5">
          {techniques.map((t) => (
            <li key={t.id} className="border border-hero-magenta/40 px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">
              {t.id}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
