// The number sign in "DAILY OP #n" (v1.2 R5). The display face is a
// 58-character subset of Press Start 2P with no '#' in it (see
// src/ui/assets/fonts/README.md), so a '#' in display text would fall
// back to the system monospace face, thin beside the pixels around it.
// This draws one on the font's own 8 by 8 grid instead, in the same
// strokes: verticals two cells wide, horizontals one cell tall, row 7
// left empty as the font leaves it under every capital. It takes the
// text colour and the text size, and reads as '#' to assistive tech.
export default function PixelHash() {
  return (
    <svg
      role="img"
      aria-label="#"
      viewBox="0 0 8 8"
      width="1em"
      height="1em"
      shapeRendering="crispEdges"
      fill="currentColor"
      style={{ display: 'inline-block', verticalAlign: '-0.125em' }}
    >
      {/* Two uprights (columns 1-2 and 4-5, rows 0-6), two bars (rows 2 and 4, columns 0-6). */}
      <path d="M1 0h2v7H1zM4 0h2v7H4zM0 2h7v1H0zM0 4h7v1H0z" />
    </svg>
  )
}
