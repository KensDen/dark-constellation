// Copy and share. copyToClipboard moved here from Game.tsx in v1.2 R5, so
// the board's save code and the score screen's share share one copy of it.

// Copy text to the clipboard with a synchronous fallback for browsers that
// gate the async clipboard API.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

// The one piece of navigator this reads, so a test can hand in any shape.
export interface ShareNavigator {
  share?: (data: { text?: string }) => Promise<void>
}

// Callable, not merely present, as vibrateSupported reads the vibrator.
export function shareSupported(nav: ShareNavigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return typeof nav?.share === 'function'
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed'

// The native share sheet where there is one (brief 7.2), and the clipboard
// where there is none. A sheet that fails falls back to the clipboard too,
// except when the player closed it, which is an answer, not a failure.
// The sheet is opened before anything is awaited: a browser only opens it
// from inside the tap that asked.
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  if (shareSupported()) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyToClipboard(text)) ? 'copied' : 'failed'
}
