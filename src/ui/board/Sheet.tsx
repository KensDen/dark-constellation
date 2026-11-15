// SYSTEM's buttons (v1.2 R1 as the bottom sheet's; the title's SYSTEM
// alone since the pixel board was retired, v2.0 R3). The sheet frame that
// rose over the board left with the board, so what stays is the three
// button looks SYSTEM's controls share.
//
// In the 3D game's look since v2.0 R3 (Ken's ruling of 15 November 2026:
// the title in 3D), so SYSTEM does not open as a pixel panel under a glass
// title: the classes are the title's own, in src/index.css.

export const SHEET_BUTTON = 'tt-btn'
export const SHEET_PRIMARY = 'tt-btn tt-go'
// A choice or a switch in SYSTEM (Ken, 21 October): the selected or ON
// state is filled, so it reads at a glance and not by a border alone.
export const SHEET_TOGGLE = (on: boolean) => (on ? 'tt-btn tt-on' : 'tt-btn tt-off')
