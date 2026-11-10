// @vitest-environment jsdom
//
// THE 3D SLICE'S RESTATED HELPERS (experiment). The slice's chunk restates
// the Dossier's store and the seed's shape instead of importing them (see
// src/ui/three/sliceModel.ts for why: the first download's budget). Two
// structures that must agree, so this joins them: a card the slice files
// is one the game's Dossier reads, and the other way; and a seed the slice
// draws or parses is one the title's Replay a seed would take.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dossier as gameDossier, fileCard as gameFile } from '../src/persistence'
import { parseSeed as gameParse } from '../src/ui/session'
import { dossier, fileCard, parseSeed, randomSeed } from '../src/ui/three/sliceModel'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  }
}

describe('the 3D slice files to the game’s own Dossier', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))

  it('a card filed in the slice is in the game’s Dossier, in its order', () => {
    fileCard('uplink-jamming')
    fileCard('backhaul-exfil')
    fileCard('uplink-jamming')
    expect([...gameDossier()]).toEqual(['backhaul-exfil', 'uplink-jamming'])
    expect(localStorage.getItem('dc-dossier')).toBe('["backhaul-exfil","uplink-jamming"]')
  })

  it('a card filed in the game is one the slice knows', () => {
    gameFile('ops-phishing')
    expect(dossier().has('ops-phishing')).toBe(true)
    fileCard('time-spoof')
    expect([...gameDossier()].sort()).toEqual(['ops-phishing', 'time-spoof'])
  })

  it('reads a damaged store as empty, as the game does', () => {
    localStorage.setItem('dc-dossier', '{not json')
    expect(dossier().size).toBe(0)
    expect(gameDossier().size).toBe(0)
  })

  it('draws and parses seeds the title would take', () => {
    for (let i = 0; i < 200; i += 1) {
      const seed = randomSeed()
      expect(gameParse(String(seed))).toBe(seed)
    }
    for (const text of ['1', '12345', '999999999', ' 42 ', '0', '', 'abc', '1234567890', '-3', '1.5']) {
      expect(parseSeed(text), text).toBe(gameParse(text))
    }
  })
})
