// Haptics (game-feel Round 6c): the Chrome-family Android tier, one
// feature-detected module, a progressive enhancement. Presentation only;
// nothing here is imported by the engine or the content modules, and it
// adds no dependency and no asset.

export {
  Haptics,
  getHaptics,
  mobileDevice,
  resetHapticsForTests,
  shouldVibrate,
  vibrateSupported,
  type HapticGateState,
  type HapticsOptions,
  type NavigatorLike,
} from './haptics'
