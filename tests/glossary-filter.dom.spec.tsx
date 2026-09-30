// @vitest-environment jsdom
//
// The GLOSSARY filter on screen. Since the frameworks are spelled as their
// owners spell them, the MITRE techniques read ATT&CK, and a filter that
// matched only the text on screen stopped finding them for "attack", the
// word a player types. The filter reads each ampersand as an a as well
// (glossaryMatches in src/ui/reference.ts), and this drives the real
// screen: type into the field, read the terms it lists.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SCENARIO } from '../src/content'
import Glossary from '../src/ui/Glossary'
import { techniqueLabel } from '../src/ui/labels'
import { glossaryEntries } from '../src/ui/reference'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Glossary onBack={() => {}} />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function filter(query: string): string[] {
  const input = container.querySelector('input[aria-label="filter glossary"]') as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(input, query)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return [...container.querySelectorAll('dt')].map((dt) => dt.textContent ?? '')
}

// The ATT&CK techniques' terms, read from the deck and the entries rather
// than written out, so a technique added to the deck is expected too.
const attackKeys = new Set(
  DEFAULT_SCENARIO.events.flatMap((e) => e.techniqueRefs).filter((r) => r.framework === 'ATTACK').map(techniqueLabel),
)
const attackTerms = glossaryEntries()
  .filter((e) => e.category === 'Technique' && attackKeys.has(e.key))
  .map((e) => e.term)

describe('the GLOSSARY filter', () => {
  it('finds every ATT&CK technique for "attack", "att&ck" and "ATT&CK"', () => {
    // The control: there are ATT&CK techniques to find, and the screen
    // spells them with the ampersand, so "attack" is not in their text.
    expect(attackTerms.length, 'the deck cites no ATT&CK technique, so nothing below asserts anything').toBeGreaterThan(0)
    for (const term of attackTerms) expect(term.toLowerCase()).not.toContain('attack')
    for (const query of ['attack', 'att&ck', 'ATT&CK', '  Attack ']) {
      const shown = filter(query)
      for (const term of attackTerms) expect(shown, `"${query}" does not find ${term}`).toContain(term)
    }
  })

  it('still narrows the list', () => {
    // So the matches above are the filter's and not a list that stopped
    // filtering: "attack" leaves most entries out, and nonsense leaves all.
    const all = filter('').length
    expect(all).toBe(glossaryEntries().length)
    expect(filter('attack').length).toBeLessThan(all)
    expect(filter('zzqx')).toEqual([])
  })
})
