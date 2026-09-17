// The content link check's decisions, in one place so the battery and the
// suite agree on them (Round 6c).
//
// Extracted for the reason the bundle budget was extracted in Round 4c:
// the logic lived inline in the battery, nothing could drive it, and it
// was wrong in a way nobody could have caught without running the whole
// battery against a live network and getting unlucky.
//
// THE DEFECT THIS ROUND FIXES. The layer retried a 429 or a 5xx, on the
// correct reasoning that a live third-party host has bad minutes. It did
// NOT retry a transport-level failure, and it excluded them explicitly:
// `!r.network && (status === 429 || status >= 500)`. But a transport
// failure is the MOST transient thing that can happen to a link, not the
// least. During Round 6b's battery runs, euspa.europa.eu began refusing at
// the transport layer under repeated requests while curl returned 200
// throughout; the round reported RED on a link that was never broken.
//
// The original exclusion was not arbitrary, which is why the fix is not
// simply to delete it. Retrying everything when the machine is genuinely
// offline costs one extra round trip and a delay per URL for no
// information: the layer already SKIPS in that case, and it knows it is
// offline precisely because every URL failed at the transport layer. So
// the retry happens AFTER the first pass, only for the URLs that failed
// that way, and only when they are not all of them. Offline pays nothing,
// and a single flaky host gets the second chance a 429 already got.

export const RETRY_DELAY_MS = 4000

// A status that means "ask again", as distinct from "this link is broken".
export function isTransientStatus(result) {
  if (result.network) return false
  return result.status === 429 || result.status >= 500
}

// Every URL failed at the transport layer, so there is no network rather
// than a broken deck. Guarded on length because `[].every()` is true and
// an empty result set is a different failure, reported separately.
export function isOffline(results) {
  return results.length > 0 && results.every((r) => r.network)
}

// Which results deserve a second look at the transport layer. Empty when
// offline, which is what keeps an offline run from paying for retries it
// cannot learn anything from.
export function transportRetryTargets(results) {
  if (isOffline(results)) return []
  return results.filter((r) => r.network)
}

// Merge a retry's answers over the first pass's, matched by URL. Results
// carry no order guarantee (the workers race), so this cannot be an index
// join, which is the obvious version and is wrong.
export function mergeRetries(results, retried) {
  const byUrl = new Map(retried.map((r) => [r.url, r]))
  return results.map((r) => byUrl.get(r.url) ?? r)
}

// The verdict, given the final results. Kept here rather than in the
// battery so the suite can assert the classification without a network.
export function classify(results, isKnownSpaStatusArtifact = () => false) {
  const broken = results.filter(
    (r) => !r.network && (r.status < 200 || r.status >= 400) && !isKnownSpaStatusArtifact(r.url, r.status),
  )
  const unreachable = results.filter((r) => r.network)
  return { broken, unreachable }
}

// THE WHOLE PIPELINE, not just the predicates it calls.
//
// Extracted a second time, in the same round, because the first extraction
// stopped short. The pure functions above were guarded and the WIRING that
// uses them was not, so the entire transport-level second pass could be
// deleted with the suite green and the one test that called itself end to
// end hand-assembled the pipeline and manufactured the retry's answer. A
// verification pass found that and it is principle 16 exactly: the guard
// was written against the code that was touched rather than against the
// behaviour the round exists to produce.
//
// Everything that touches the world is injected: `check` does one request,
// `wait` is the delay, `concurrency` bounds the first pass. So a test
// drives this function, and the battery passes the real implementations.
export async function runLinkCheck({
  urls,
  check,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  concurrency = 6,
  isKnownSpaStatusArtifact = () => false,
  originPrefix = null,
  originUrl = null,
}) {
  if (urls.length === 0) return { outcome: 'fail', reason: 'no-urls', results: [] }

  // One retry on a transient STATUS, inline, exactly as before.
  const checkWithStatusRetry = async (url) => {
    const first = await check(url)
    if (!isTransientStatus(first)) return first
    await wait(RETRY_DELAY_MS)
    return check(url)
  }

  if (originPrefix && originUrl && urls.some((u) => u.startsWith(originPrefix))) {
    const origin = await checkWithStatusRetry(originUrl)
    if (!origin.network && (origin.status < 200 || origin.status >= 400)) {
      return { outcome: 'fail', reason: 'origin', origin, results: [] }
    }
  }

  const results = []
  let cursor = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor]
        cursor += 1
        results.push(await checkWithStatusRetry(url))
      }
    }),
  )

  // The transport-level second pass. Bounded by the same concurrency as
  // the first: firing every failed host at once is how a layer that exists
  // to survive rate limiting re-triggers it. Each retry is caught on its
  // own, because Promise.all rejects as a whole and one thrown request
  // would discard every other answer.
  const targets = transportRetryTargets(results)
  let finalResults = results
  if (targets.length > 0) {
    await wait(RETRY_DELAY_MS)
    const retried = []
    let i = 0
    await Promise.all(
      Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
        while (i < targets.length) {
          const target = targets[i]
          i += 1
          try {
            retried.push(await check(target.url))
          } catch {
            retried.push(target)
          }
        }
      }),
    )
    finalResults = mergeRetries(results, retried)
  }

  if (isOffline(finalResults)) return { outcome: 'skip', reason: 'offline', results: finalResults }
  const { broken, unreachable } = classify(finalResults, isKnownSpaStatusArtifact)
  if (broken.length || unreachable.length) {
    return { outcome: 'fail', reason: 'links', broken, unreachable, results: finalResults }
  }
  return { outcome: 'ok', results: finalResults }
}
