// Two small pieces of scenery the briefing's scenes fly (v1.2 R2): a
// cloud and a satellite in silhouette. The board's backdrops, which these
// once crossed, left with the layer panels in v1.3 R2.

import { sprite } from './sprite'

export const CLOUD = sprite(
  { w: { token: 'ink', alpha: 0.3 }, q: { token: 'muted', alpha: 0.2 } },
  `....wwww........ ..wwwwwwww.ww... .wwwwwwwwwwwwww. qqqqqqqqqqqqqqqq`,
)

// A satellite in silhouette: panels, body, panels.
export const SILHOUETTE = sprite({ q: { token: 'muted', alpha: 0.7 }, w: { token: 'ink', alpha: 0.85 } }, `qq.w.qq qqqwqqq qq.w.qq`)
