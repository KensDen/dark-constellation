// Shared art lookups (R2 art, reused by the Round 3 cues). The event
// icons and layer badges were authored as original vector work in R2;
// both the aftermath ledger and the playback card now read them from
// here, so a new vector or layer is wired in one place.

import type { Layer, Vector } from '../../engine/types'
import iconRf from '../assets/icon-rf.svg'
import iconLidar from '../assets/icon-lidar.svg'
import iconSupplyChain from '../assets/icon-supply-chain.svg'
import iconInsider from '../assets/icon-insider.svg'
import iconCyber from '../assets/icon-cyber.svg'
import iconDebris from '../assets/icon-debris.svg'
import badgeOrbit from '../assets/badge-orbit.svg'
import badgeAir from '../assets/badge-air.svg'
import badgeGround from '../assets/badge-ground.svg'

export const vectorIcons: Record<Vector, string> = {
  rf: iconRf,
  optical: iconLidar,
  supplyChain: iconSupplyChain,
  human: iconInsider,
  cyber: iconCyber,
  environmental: iconDebris,
}

export const layerBadges: Record<Layer, string> = {
  ORBIT: badgeOrbit,
  AIR: badgeAir,
  GROUND: badgeGround,
}
