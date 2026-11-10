// THE PIXEL BOARD, DEFERRED (v2.0 R1). The title's PLAY opens the 3D game,
// so the board is a detour now (?view=classic) and no longer rides in the
// first download, which had 39 bytes left under its ceiling with it in.
// Loaded once and kept, and rendered from the loaded module rather than
// through React.lazy: a board that is already here mounts in the same
// commit as the tap that opened it, as it always has (the DOM suites load
// it before they run, tests/setup-canvas.ts, and hold exactly that).

type Game = (typeof import('./Game'))['default']

let loaded: Game | null = null
export const classicGame = (): Game | null => loaded
export const loadClassic = (): Promise<Game> => import('./Game').then((m) => (loaded = m.default))
