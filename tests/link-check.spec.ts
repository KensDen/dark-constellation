// The content link check's decisions (Round 6c).
//
// The layer retried a 429 or a 5xx and explicitly did NOT retry a
// transport-level failure, which is the most transient failure there is.
// Round 6b's battery reported RED on euspa.europa.eu while curl returned
// 200 for it throughout; the link was never broken, the host was refusing
// connections under repeated requests. Nothing could catch that before
// this round because the logic lived inline in the battery and only ran
// against a live network.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  RETRY_DELAY_MS,
  classify,
  isOffline,
  isTransientStatus,
  mergeRetries,
  runLinkCheck,
  transportRetryTargets,
  BOT_PROTECTED,
  isBotProtected,
  isExcused,
  isKnownSpaStatusArtifact,
  RUNNER_BLOCKED,
  isRunnerBlocked,
  runnerBlockedWarning,
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
    // The battery's own predicate, since v1.2 R5b moved it here.
    const isArtifact = isKnownSpaStatusArtifact
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

describe('link check: pages behind bot protection (v1.2 R5b)', () => {
  // The allow-list excuses exactly what it lists: the URL, and the status
  // the host's bot protection answers with. Anything else still fails.
  const listed = BOT_PROTECTED[0]

  it('excuses a listed page only for its listed status', () => {
    expect(isBotProtected(listed.url, listed.statuses[0])).toBe(true)
    for (const status of [404, 410, 500, 401]) expect(isBotProtected(listed.url, status), String(status)).toBe(false)
  })

  it('excuses no other page on the same host', () => {
    const sibling = new URL(listed.url)
    sibling.pathname = '/@pwnsat/some-other-article'
    expect(isBotProtected(sibling.href, listed.statuses[0])).toBe(false)
  })

  it('classifies a listed 403 as passing and the same host\'s 404 as broken', () => {
    const { broken } = classify(
      [
        { url: listed.url, status: 403 },
        { url: listed.url.replace('b7be24d91ff8', 'deadbeef0000'), status: 403 },
        { url: 'https://example.org/gone', status: 404 },
      ],
      (url: string, status: number) => isBotProtected(url, status),
    )
    expect(broken.map((r: { url: string }) => r.url)).toEqual([listed.url.replace('b7be24d91ff8', 'deadbeef0000'), 'https://example.org/gone'])
  })

  it('lists only pages the content still carries, each with its reason, its date and how it was checked', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content')
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []))
    const content = walk(dir).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(BOT_PROTECTED.length).toBeGreaterThan(0)
    for (const entry of BOT_PROTECTED) {
      expect(content.includes(`'${entry.url}'`), `${entry.url} is no longer in the content`).toBe(true)
      expect(entry.statuses.length).toBeGreaterThan(0)
      for (const status of entry.statuses) expect(status >= 400 && status < 500, `${entry.url} excuses ${status}`).toBe(true)
      expect(entry.reason.length).toBeGreaterThan(20)
      expect(entry.how.length).toBeGreaterThan(20)
      expect(entry.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe("link check: the battery's excuses, end to end (v1.2 R5b)", () => {
  // isExcused is exactly what scripts/battery.mjs hands runLinkCheck. Run it
  // over a scripted network: a listed page's 403 passes, and nothing else
  // does, not a sibling page on the same host and not a 403 from anyone else.
  const listed = BOT_PROTECTED[0].url
  const scripted = (answers: Record<string, number>) => async (url: string) => ({ url, status: answers[url] ?? 200 })

  it('passes a listed page answering 403, and the ATLAS SPA answering 404 behind a live origin', async () => {
    const out = await runLinkCheck({
      urls: [listed, 'https://atlas.mitre.org/techniques/AML.T0043', 'https://example.org/fine'],
      check: scripted({ [listed]: 403, 'https://atlas.mitre.org/techniques/AML.T0043': 404 }),
      wait: async () => {},
      isKnownSpaStatusArtifact: isExcused,
      originPrefix: 'https://atlas.mitre.org/',
      originUrl: 'https://atlas.mitre.org/',
    })
    expect(out.outcome).toBe('ok')
  })

  it('fails a 403 from a sibling page, from another host, and a 404 from the listed page', async () => {
    const sibling = listed.replace(/-[0-9a-f]+$/, '-000000000000')
    for (const [url, status] of [
      [sibling, 403],
      ['https://www.cisa.gov/stopransomware', 403],
      [listed, 404],
    ] as const) {
      const out = await runLinkCheck({ urls: [url], check: scripted({ [url]: status }), wait: async () => {}, isKnownSpaStatusArtifact: isExcused })
      expect(out.outcome, `${url} answering ${status} passed`).toBe('fail')
    }
  })
})

describe('link check: pages that block CI runners (v1.2 R5b follow-up)', () => {
  // The first deploy of R5b went RED because two hosts refuse the GitHub
  // Actions runner (a 403 from one, no answer at all from the other) while
  // serving the page to a person. A listed page answering that way is a
  // WARNING, not a failure. Everything else a listed page answers, and
  // everything any unlisted page answers, is judged exactly as before.
  // Driven through runLinkCheck with the same two predicates
  // scripts/battery.mjs passes it (isExcused and isRunnerBlocked), so the
  // pipeline is exercised and not just the predicate. The suite does NOT
  // read battery.mjs: its passing of isRunnerBlocked and its printing of the
  // warning are exercised only by a live battery run, as for isExcused.
  type Result = { url: string; status?: number; network?: boolean }
  const listed = RUNNER_BLOCKED[0].url
  const alsoListed = RUNNER_BLOCKED[1].url
  const fine = 'https://example.org/fine'

  // A scripted network: each url gets a queue of answers, one per attempt,
  // and the last answer repeats. The same shape as the pipeline tests above.
  function net(script: Record<string, Array<Record<string, unknown>>>) {
    const attempts: string[] = []
    return {
      attempts,
      check: async (url: string) => {
        attempts.push(url)
        const queue = script[url]
        const next = queue.length > 1 ? queue.shift()! : queue[0]
        return { url, ...next }
      },
    }
  }
  const battery = (urls: string[], n: ReturnType<typeof net>) =>
    runLinkCheck({ urls, check: n.check, wait: async () => {}, isKnownSpaStatusArtifact: isExcused, isWarnOnly: isRunnerBlocked })

  it('warns, and does not fail, when a listed page answers 403', async () => {
    const n = net({ [listed]: [{ status: 403 }], [fine]: [{ status: 200 }] })
    const out = await battery([listed, fine], n)
    expect(out.outcome, 'a listed page answering 403 failed the battery').toBe('ok')
    expect(out.warned.map((r: Result) => r.url), 'the 403 passed silently instead of warning').toEqual([listed])
    expect(n.attempts, 'a listed page was not requested at all').toContain(listed)
    const line = runnerBlockedWarning(out.warned[0])
    expect(line.startsWith('WARNING: '), line).toBe(true)
    expect(line, 'the warning does not name the page').toContain(listed)
    expect(line, 'the warning does not give the verify date').toContain('2026-09-29')
    expect(line).toContain('HTTP 403')
  })

  it('warns on a listed page that times out or refuses the connection, after the retry every page gets', async () => {
    // A timeout and a refused connection both arrive as `network`.
    const n = net({ [alsoListed]: [{ network: true }], [fine]: [{ status: 200 }] })
    const out = await battery([alsoListed, fine], n)
    expect(out.outcome, 'a listed page that never answered failed the battery').toBe('ok')
    expect(out.warned.map((r: Result) => r.url)).toEqual([alsoListed])
    expect(n.attempts.filter((u) => u === alsoListed), 'the listed page did not get its transport retry').toHaveLength(2)
    expect(runnerBlockedWarning(out.warned[0])).toContain('a timeout or connection error')
  })

  it('keeps the warning when the run fails for another reason', async () => {
    // The battery prints warnings on a red run too, which only works if the
    // failing outcome still carries them, and does not count the listed
    // page among the broken.
    const gone = 'https://example.org/gone'
    const out = await battery([listed, gone], net({ [listed]: [{ status: 403 }], [gone]: [{ status: 404 }] }))
    expect(out.outcome).toBe('fail')
    expect(out.broken.map((r: Result) => r.url), 'the listed 403 was counted as broken').toEqual([gone])
    expect(out.warned.map((r: Result) => r.url), 'a failing run dropped the warning').toEqual([listed])
  })

  it('passes a listed page that answers on the retry, with no warning', async () => {
    const n = net({ [alsoListed]: [{ network: true }, { status: 200 }], [fine]: [{ status: 200 }] })
    const out = await battery([alsoListed, fine], n)
    expect(out.outcome).toBe('ok')
    expect(out.warned, 'a page that answered on its retry was still warned about').toHaveLength(0)
  })

  it('still fails a listed page that answers 404 or 410', async () => {
    for (const status of [404, 410]) {
      const out = await battery([listed], net({ [listed]: [{ status }] }))
      expect(out.outcome, `a listed page answering ${status} passed`).toBe('fail')
      expect(out.broken.map((r: Result) => r.url)).toEqual([listed])
      expect(out.warned, `a listed ${status} was downgraded to a warning`).toHaveLength(0)
    }
  })

  it('still fails every other error a listed page answers', async () => {
    // 401 is not what a runner-blocking host sends; a 500 that is still a
    // 500 after its inline retry is an outage, not a block.
    for (const status of [401, 451, 500]) {
      const out = await battery([listed], net({ [listed]: [{ status }] }))
      expect(out.outcome, `a listed page answering ${status} passed`).toBe('fail')
      expect(out.warned).toHaveLength(0)
    }
  })

  it('still fails a 403 from a page that is not listed, including one on the same host', async () => {
    const sibling = listed.replace(/uuid:[0-9a-f-]+$/, 'uuid:00000000-0000-0000-0000-000000000000')
    expect(sibling).not.toBe(listed)
    for (const url of [sibling, 'https://www.cisa.gov/stopransomware']) {
      const out = await battery([url, fine], net({ [url]: [{ status: 403 }], [fine]: [{ status: 200 }] }))
      expect(out.outcome, `${url}, not listed, answering 403 passed`).toBe('fail')
      expect(out.broken.map((r: Result) => r.url)).toEqual([url])
      expect(out.warned).toHaveLength(0)
    }
  })

  it('still fails a page that is not listed and never answers', async () => {
    const dead = 'https://example.org/dead'
    const out = await battery([dead, fine], net({ [dead]: [{ network: true }], [fine]: [{ status: 200 }] }))
    expect(out.outcome).toBe('fail')
    expect(out.unreachable.map((r: Result) => r.url)).toEqual([dead])
    expect(out.warned).toHaveLength(0)
  })

  it('changes nothing for a caller that passes no warn-only predicate', () => {
    // classify and runLinkCheck default isWarnOnly to "excuse nothing", so
    // every caller that predates it gets the old verdict.
    const { broken, unreachable, warned } = classify([
      { url: listed, status: 403 },
      { url: alsoListed, network: true },
    ])
    expect(broken.map((r: Result) => r.url)).toEqual([listed])
    expect(unreachable.map((r: Result) => r.url)).toEqual([alsoListed])
    expect(warned).toHaveLength(0)
  })

  it('lists only pages the content still carries, each with its reason, who verified it, and the date', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content')
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []))
    const content = walk(dir).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(RUNNER_BLOCKED.length).toBeGreaterThan(0)
    for (const entry of RUNNER_BLOCKED) {
      expect(content.includes(`'${entry.url}'`), `${entry.url} is no longer in the content`).toBe(true)
      expect(entry.reason).toBe('host blocks CI runners; 403 or unreachable from GitHub Actions')
      expect(entry.verified).toMatch(/^verified reachable by Ken \d{4}-\d{2}-\d{2}$/)
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.verified.endsWith(entry.date), `${entry.url}: the verified line and the date disagree`).toBe(true)
      expect(isRunnerBlocked({ url: entry.url, status: 403 })).toBe(true)
    }
  })
})
