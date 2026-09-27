// What the debrief lists (v1.2 R5, brief 4.8): the threats this campaign
// actually drew, in the order the player first met them, each with the
// turns it came on and whether it landed. Everything a threat says about
// itself (its techniques, its learn-more sources) is the content's own,
// read from the scenario the campaign carries, so the debrief can say
// nothing the content does not. Opportunities are not threats and are
// left out. Imported by the debrief alone, so it rides in that chunk.

import type { GameState, LearnMoreSource, ThreatEvent } from '../engine/types'

export interface Encounter {
  turn: number
  // An effective severity above 0: the same line "hits taken" draws.
  landed: boolean
}

export interface FacedThreat {
  def: ThreatEvent
  encounters: Encounter[]
  // Every source on the threat's learn-more cards, each URL once.
  sources: LearnMoreSource[]
}

export function threatsFaced(state: GameState): FacedThreat[] {
  const faced = new Map<string, FacedThreat>()
  for (const rec of state.history) {
    for (const ev of rec.events) {
      const def = state.scenario.events.find((e) => e.id === ev.eventId)
      if (!def || (def.kind ?? 'threat') !== 'threat') continue
      let entry = faced.get(def.id)
      if (!entry) {
        const byUrl = new Map<string, LearnMoreSource>()
        for (const card of def.learnMoreCards) for (const src of card.sources) if (!byUrl.has(src.url)) byUrl.set(src.url, src)
        entry = { def, encounters: [], sources: [...byUrl.values()] }
        faced.set(def.id, entry)
      }
      entry.encounters.push({ turn: rec.turn, landed: ev.effectiveSeverity > 0 })
    }
  }
  return [...faced.values()]
}
