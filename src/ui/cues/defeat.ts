// The defeat scene's words (QC gauntlet Q17), in a module of their own so
// Scene.tsx adds no new non-component exports (react only-export-components).

import type { GameState } from '../../engine/types'

// What ended the campaign, in the player's words (QC gauntlet Q17).
export const LOSS_LABEL: Record<NonNullable<GameState['lossReason']>, string> = {
  belowThreshold: 'Below the win line',
  maiCollapse: 'MAI collapse',
  insolvency: 'Budget insolvent',
}

// The threat behind a recapped technique: the most recent event that fired
// it, so a chip reads as what hit the player, with the code beside it.
export function recapName(state: GameState, techniqueId: string): string {
  for (let i = state.history.length - 1; i >= 0; i -= 1) {
    const ev = state.history[i].events.find((e) => e.firedTechniqueRefs.some((r) => r.id === techniqueId))
    if (ev) return ev.name
  }
  return techniqueId
}
