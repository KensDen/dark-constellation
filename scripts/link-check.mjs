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

// BOT-PROTECTED PAGES (v1.2 R5b). Some hosts answer an automated request
// with a challenge page and a 4xx where a browser gets the page. Such a
// link is not broken, and dropping it would drop a source that a person
// checked. So it is listed here, exact URL by exact URL: the status it is
// excused, why, and when and how a person last opened it in a browser.
// Any other status from it still fails, and so does every other URL on
// the same host. tests/link-check.spec.ts holds each entry to a URL the
// content still carries, so a stale entry fails rather than lingers.
export const BOT_PROTECTED = [
  {
    url: 'https://medium.com/@pwnsat/interception-and-eavesdropping-of-satellite-communications-b7be24d91ff8',
    statuses: [403],
    reason:
      'Medium answers automated requests with a Cloudflare challenge page ("Attention Required!", HTTP 403), whatever the user agent.',
    checked: '2026-09-30',
    how: 'verified by Ken 2026-09-30: title, author (PWNSAT) and date (3 Jan 2026) match the Field Library entry, which the draft fetched on 2026-09-26',
  },
  {
    url: 'https://medium.com/@pwnsat/from-mitre-att-ck-to-sparta-a-unified-attack-flow-for-space-systems-00dd7ef26618',
    statuses: [403],
    reason:
      'Medium answers automated requests with a Cloudflare challenge page ("Attention Required!", HTTP 403), whatever the user agent.',
    checked: '2026-09-30',
    how: 'verified by Ken 2026-09-30: title, author (PWNSAT) and date (17 Sep 2025) match the Field Library entry, which the draft fetched on 2026-09-26',
  },
]

// Whether a status from a URL is a listed bot-protection answer.
export function isBotProtected(url, status, list = BOT_PROTECTED) {
  return list.some((entry) => entry.url === url && entry.statuses.includes(status))
}

// PAGES THAT BLOCK CI RUNNERS (v1.2 R5b follow-up). Some hosts refuse or
// drop requests from CI runners while serving the same page to a person.
// The first deploy of R5b went RED on two of them: ora.ox.ac.uk answered
// the GitHub Actions runner with a 403 and media.defcon.org never answered
// it, while both returned 200 from Ken's machine the same night. From the
// runner such a link cannot be told apart from a broken one, so it is
// listed here, exact URL by exact URL, with why, who verified it and when.
//
// A listed page is still requested on every run, retries included. If its
// final answer is a 403, a timeout or a connection error, the battery
// prints a WARNING naming the page and its verify date instead of failing.
// Any other answer is judged exactly as before: a 404 or a 410 still
// fails, and so does every other error status. Every page NOT listed here
// is judged exactly as it was. The suite holds each entry to a URL the
// content still carries, as it does for BOT_PROTECTED.
export const RUNNER_BLOCKED = [
  {
    url: 'https://ora.ox.ac.uk/objects/uuid:92566006-9d2d-4696-b678-7125c802e36c',
    reason: 'host blocks CI runners; 403 or unreachable from GitHub Actions',
    verified: 'verified reachable by Ken 2026-09-29',
    date: '2026-09-29',
  },
  {
    url: 'https://media.defcon.org/DEF%20CON%2034/DEF%20CON%2034%20presentations/DEF%20CON%2034%20-%20Romel%20Marin%20-%20Lowering%20the%20Orbit%20Exploiting%20Satellite%20Protocols%20and%20communications%20via%20Software-Defined-Radio%20and%20GS%20-%20v2%20Pro.pdf',
    reason: 'host blocks CI runners; 403 or unreachable from GitHub Actions',
    verified: 'verified reachable by Ken 2026-09-29',
    date: '2026-09-29',
  },
]

// The one status a runner-blocking host answers with. A timeout or a
// refused connection arrives as a transport-level result (`network`),
// which carries no status, and is covered by the predicate below.
export const RUNNER_BLOCKED_STATUSES = [403]

// Whether a FINAL result is a listed page answering the way a host that
// blocks runners does. Judged after the transport retry, so a listed page
// that answers 200 on its second try is simply a pass, with no warning.
export function isRunnerBlocked(result, list = RUNNER_BLOCKED) {
  if (!list.some((entry) => entry.url === result.url)) return false
  return result.network === true || RUNNER_BLOCKED_STATUSES.includes(result.status)
}

// The warning the battery prints for one such result. Kept here so the
// suite pins its wording: it names the page and the date it was verified.
export function runnerBlockedWarning(result, list = RUNNER_BLOCKED) {
  const entry = list.find((e) => e.url === result.url)
  const answer = result.network ? 'a timeout or connection error' : `HTTP ${result.status}`
  return `WARNING: ${result.url} answered ${answer}; not failed: ${entry.reason} (${entry.verified}, date ${entry.date})`
}

// atlas.mitre.org serves its technique pages as a client-rendered SPA and
// returns HTTP 404 status to non-browser fetchers for every deep link
// (verified 2026-07-12: curl with any user agent gets 404 on /techniques/*
// and even /matrices, while browsers render the real page; the site's own
// navigation links to these exact paths). The deep URLs are canonical and
// were content-verified by rendered fetch in the R3 verification round, so
// for this host a 404 is the expected non-browser status: the check
// instead requires the ATLAS origin itself to be reachable, and any
// non-404 error status still fails. Moved here from the battery in v1.2
// R5b, so the suite tests the predicate the battery uses.
export function isKnownSpaStatusArtifact(url, status) {
  return url.startsWith('https://atlas.mitre.org/') && status === 404
}

// Every status the layer excuses, as the battery passes it to runLinkCheck.
export function isExcused(url, status) {
  return isKnownSpaStatusArtifact(url, status) || isBotProtected(url, status)
}

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
// `isWarnOnly` takes a whole result, because a timeout has no status to
// test. By default it excuses nothing, so a caller that does not pass it
// gets the classification exactly as it was before it existed.
export function classify(results, isKnownSpaStatusArtifact = () => false, isWarnOnly = () => false) {
  const warned = results.filter((r) => isWarnOnly(r))
  const broken = results.filter(
    (r) =>
      !r.network && (r.status < 200 || r.status >= 400) && !isKnownSpaStatusArtifact(r.url, r.status) && !isWarnOnly(r),
  )
  const unreachable = results.filter((r) => r.network && !isWarnOnly(r))
  return { broken, unreachable, warned }
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
  isWarnOnly = () => false,
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
  const { broken, unreachable, warned } = classify(finalResults, isKnownSpaStatusArtifact, isWarnOnly)
  if (broken.length || unreachable.length) {
    return { outcome: 'fail', reason: 'links', broken, unreachable, warned, results: finalResults }
  }
  return { outcome: 'ok', warned, results: finalResults }
}
