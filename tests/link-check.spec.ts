// The content link check's decisions (Round 6c).
//
// The layer retried a 429 or a 5xx and explicitly did NOT retry a
// transport-level failure, which is the most transient failure there is.
// Round 6b's battery reported RED on euspa.europa.eu while curl returned
// 200 for it throughout; the link was never broken, the host was refusing
// connections under repeated requests. Nothing could catch that before
// this round because the logic lived inline in the battery and only ran
// against a live network.

import { describe, expect, it } from 'vitest'

import {
  RETRY_DELAY_MS,
  classify,
  isOffline,
  isTransientStatus,
  mergeRetries,
  runLinkCheck,
  transportRetryTargets,
} from '../scripts/link-check.mjs'

const ok = (url: string) => ({ url, status: 200 })
const gone = (url: string) => ({ url, status: 404 })
const rateLimited = (url: string) => ({ url, status: 429 })
const down = (url: string) => ({ url, status: 503 })
const refused = (url: string) => ({ url, network: true })

describe('link check: what deserves another look', () => {
  it('retries a transport failure, which is the whole of this round', () => {
    const results = [ok('a'), refused('b'), ok('c')]
    expect(transportRetryTargets(results).map((r) => r.url), 'a refused connection was not retried').toEqual(['b'])
  })

  // The positive control for the line above, and the reason the fix is not
  // simply deleting the old exclusion: when EVERY url failed at the
  // transport layer the machine is offline, the layer already knows to
  // skip, and retrying buys nothing but a delay per url.
  it('retries nothing when every url failed that way, because that is offline', () => {
    const results = [refused('a'), refused('b'), refused('c')]
    expect(isOffline(results)).toBe(true)
    expect(transportRetryTargets(results), 'an offline run paid for retries it cannot learn from').toHaveLength(0)
  })

  it('does not call an empty result set offline', () => {
    // [].every() is true, so the obvious implementation reports offline for
    // a deck with no URLs at all, which is a different failure and is
    // reported separately by the caller.
    expect(isOffline([])).toBe(false)
    expect(transportRetryTargets([])).toHaveLength(0)
  })

  it('still treats a 429 and a 5xx as worth asking again, and a 404 as not', () => {
    expect(isTransientStatus(rateLimited('a'))).toBe(true)
    expect(isTransientStatus(down('a'))).toBe(true)
    expect(isTransientStatus(gone('a')), 'a 404 was retried, so a broken link takes twice as long to fail').toBe(false)
    expect(isTransientStatus(ok('a'))).toBe(false)
    // A transport failure is NOT handled by the inline status retry; it is
    // handled by the second pass. Asserted so the two paths cannot quietly
    // become one and retry an offline run twice over.
    expect(isTransientStatus(refused('a'))).toBe(false)
  })
})

describe('link check: merging a retry', () => {
  it('matches by url rather than by position', () => {
    // The workers race, so results carry no order guarantee. An index join
    // is the obvious version and would attribute one host's answer to
    // another, which is a green battery on a genuinely broken link.
    const results = [ok('a'), refused('b'), gone('c')]
    const merged = mergeRetries(results, [ok('b')])
    expect(merged.find((r) => r.url === 'b')).toEqual(ok('b'))
    expect(merged.find((r) => r.url === 'a')).toEqual(ok('a'))
    expect(merged.find((r) => r.url === 'c'), 'the retry overwrote a url it was never about').toEqual(gone('c'))
  })

  it('leaves a url the retry did not cover alone', () => {
    const results = [refused('a'), refused('b')]
    expect(mergeRetries(results, [])).toEqual(results)
  })

  it('turns a recovered host green end to end', () => {
    // The Round 6b scenario, start to finish: one host refuses, the rest
    // answer, the retry succeeds, nothing is reported broken.
    const first = [ok('a'), refused('flaky'), ok('c')]
    const targets = transportRetryTargets(first)
    const merged = mergeRetries(first, targets.map((r) => ok(r.url)))
    const { broken, unreachable } = classify(merged)
    expect(unreachable, 'a recovered host was still reported unreachable').toHaveLength(0)
    expect(broken).toHaveLength(0)
  })

  it('still fails a host that refuses twice', () => {
    // The positive control for the test above: the retry is a second
    // chance, not an amnesty.
    const first = [ok('a'), refused('dead'), ok('c')]
    const merged = mergeRetries(first, [refused('dead')])
    const { unreachable } = classify(merged)
    expect(unreachable.map((r) => r.url)).toEqual(['dead'])
  })
})

describe('link check: classification', () => {
  it('separates broken from unreachable', () => {
    const { broken, unreachable } = classify([ok('a'), gone('b'), refused('c')])
    expect(broken.map((r) => r.url)).toEqual(['b'])
    expect(unreachable.map((r) => r.url)).toEqual(['c'])
  })

  it('honours the known SPA artifact without honouring anything else', () => {
    const isArtifact = (url: string, status: number) => url.startsWith('https://atlas.mitre.org/') && status === 404
    const results = [
      { url: 'https://atlas.mitre.org/techniques/AML.T0051', status: 404 },
      { url: 'https://atlas.mitre.org/techniques/AML.T0052', status: 500 },
      { url: 'https://example.com/gone', status: 404 },
    ]
    const { broken } = classify(results, isArtifact)
    // The 404 on the SPA host is expected; its 500 is not, and neither is
    // anyone else's 404.
    expect(broken.map((r) => r.url)).toEqual([
      'https://atlas.mitre.org/techniques/AML.T0052',
      'https://example.com/gone',
    ])
  })

  it('counts a 3xx as neither broken nor unreachable', () => {
    // curl and fetch both follow redirects, so a 3xx reaching here means
    // the chain ended there; 200 to 399 is the success band the caller has
    // always used and this pins it rather than leaving it implicit.
    expect(classify([{ url: 'a', status: 301 }]).broken).toHaveLength(0)
    expect(classify([{ url: 'a', status: 399 }]).broken).toHaveLength(0)
    expect(classify([{ url: 'a', status: 400 }]).broken).toHaveLength(1)
    expect(classify([{ url: 'a', status: 199 }]).broken).toHaveLength(1)
  })
})

describe('link check: the pipeline the battery actually runs', () => {
  // THE GUARD THE FIRST VERSION OF THIS PIECE DID NOT HAVE, and a
  // verification pass said so: the pure predicates above were all
  // exercised while the WIRING that calls them was not, so the entire
  // transport-level second pass could be deleted with the suite green and
  // the test that called itself end to end hand-assembled the pipeline and
  // manufactured the retry's answer. These drive runLinkCheck, which is
  // what scripts/battery.mjs calls.

  // A scripted network: each url gets a queue of answers, one per attempt.
  function net(script: Record<string, Array<Record<string, unknown>>>) {
    const attempts: string[] = []
    const waits: number[] = []
    return {
      attempts,
      waits,
      wait: async (ms: number) => {
        waits.push(ms)
      },
      check: async (url: string) => {
        attempts.push(url)
        const queue = script[url]
        const next = queue.length > 1 ? queue.shift()! : queue[0]
        return { url, ...next }
      },
    }
  }

  it('recovers a host that refused once and answers on the retry', () => {
    const n = net({
      a: [{ status: 200 }],
      flaky: [{ network: true }, { status: 200 }],
      c: [{ status: 200 }],
    })
    return runLinkCheck({ urls: ['a', 'flaky', 'c'], check: n.check, wait: n.wait, concurrency: 2 }).then((out) => {
      expect(out.outcome, 'a recovered host still failed the battery').toBe('ok')
      expect(n.attempts.filter((u) => u === 'flaky'), 'the refused host was not retried exactly once').toHaveLength(2)
      expect(n.waits, 'the retry did not wait before asking again').toEqual([RETRY_DELAY_MS])
    })
  })

  // The positive control: the retry is a second chance, not an amnesty.
  it('still fails a host that refuses twice', async () => {
    const n = net({ a: [{ status: 200 }], dead: [{ network: true }] })
    const out = await runLinkCheck({ urls: ['a', 'dead'], check: n.check, wait: n.wait })
    expect(out.outcome).toBe('fail')
    expect(out.unreachable.map((r: { url: string }) => r.url)).toEqual(['dead'])
  })

  it('skips offline without paying for a single retry', async () => {
    const n = net({ a: [{ network: true }], b: [{ network: true }] })
    const out = await runLinkCheck({ urls: ['a', 'b'], check: n.check, wait: n.wait })
    expect(out.outcome).toBe('skip')
    expect(n.attempts, 'an offline run retried urls it could learn nothing from').toHaveLength(2)
    expect(n.waits, 'an offline run waited for a retry it never made').toHaveLength(0)
  })

  it('retries a 429 inline and a refusal in the second pass, and not the other way round', async () => {
    const n = net({
      slow: [{ status: 429 }, { status: 200 }],
      refused: [{ network: true }, { status: 200 }],
    })
    const out = await runLinkCheck({ urls: ['slow', 'refused'], check: n.check, wait: n.wait, concurrency: 1 })
    expect(out.outcome).toBe('ok')
    // Two waits: one for the inline status retry, one before the transport
    // pass. If either path handled both kinds there would be a different
    // number.
    expect(n.waits).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS])
  })

  it('does not lose every answer when one retry throws', async () => {
    // Promise.all rejects as a whole, so an unguarded retry pass would
    // discard the results of every other host because one threw.
    let thrown = false
    const check = async (url: string) => {
      if (url === 'boom' && thrown) throw new Error('socket hang up')
      if (url === 'boom') {
        thrown = true
        return { url, network: true }
      }
      if (url === 'alsobad') return { url, network: true }
      return { url, status: 200 }
    }
    const out = await runLinkCheck({ urls: ['ok1', 'boom', 'alsobad'], check, wait: async () => {} })
    expect(out.outcome, 'a thrown retry took the whole check down').toBe('fail')
    expect(out.unreachable.map((r: { url: string }) => r.url).sort()).toEqual(['alsobad', 'boom'])
  })

  it('bounds the retry pass rather than firing every failed host at once', async () => {
    // The layer exists to survive rate limiting. Retrying twenty refused
    // hosts simultaneously is how it would cause it.
    //
    // ONE URL SUCCEEDS, and that is not decoration. The first version made
    // every url fail, which is the OFFLINE path: transportRetryTargets
    // returns nothing, the retry block never runs, and `peak` was measuring
    // the FIRST pass's bound the whole time. It asserted a limit on a loop
    // it never entered, and deleting the limit left it green. Found by a
    // mutation, then confirmed by the re-review.
    let live = 0
    let firstPassPeak = 0
    let retryPeak = 0
    let inRetry = false
    const check = async (url: string) => {
      live += 1
      if (inRetry) retryPeak = Math.max(retryPeak, live)
      else firstPassPeak = Math.max(firstPassPeak, live)
      await Promise.resolve()
      live -= 1
      return url.startsWith('bad') ? { url, network: true } : { url, status: 200 }
    }
    const urls = ['good', ...Array.from({ length: 8 }, (_, i) => `bad${i}`)]
    await runLinkCheck({
      urls,
      check,
      wait: async () => {
        // The only wait in this run is the one before the retry pass, so
        // this is where the second phase begins.
        inRetry = true
      },
      concurrency: 2,
    })
    expect(inRetry, 'the retry pass never ran, so the bound below is about nothing').toBe(true)
    expect(retryPeak, 'the retry pass never made a request').toBeGreaterThan(0)
    expect(retryPeak, 'the retry pass ignored the concurrency bound').toBeLessThanOrEqual(2)
    // The positive control: eight hosts were retried, so a bound of two is
    // a real constraint rather than a count that never had room to exceed.
    expect(firstPassPeak).toBeLessThanOrEqual(2)
  })

  it('fails on an unreachable origin without checking the rest', async () => {
    const n = net({ 'https://atlas.mitre.org/': [{ status: 500 }], 'https://atlas.mitre.org/x': [{ status: 200 }] })
    const out = await runLinkCheck({
      urls: ['https://atlas.mitre.org/x'],
      check: n.check,
      wait: n.wait,
      originPrefix: 'https://atlas.mitre.org/',
      originUrl: 'https://atlas.mitre.org/',
    })
    expect(out.reason).toBe('origin')
  })

  it('reports an empty deck as a failure rather than as offline', async () => {
    const out = await runLinkCheck({ urls: [], check: async () => ({ url: '', status: 200 }) })
    expect(out.outcome).toBe('fail')
    expect(out.reason).toBe('no-urls')
  })
})
