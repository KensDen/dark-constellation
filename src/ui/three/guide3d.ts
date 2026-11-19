// THE BRIEFING, THE GUIDE, AND WHAT THE WATCH OFFICER SAYS AS THE PLAYER
// ACTS (v2.0 R1 to R5; a module of their own since v2.0 R6). Only the game
// says them: no card prints them and the rooms never do, so they ride in
// the game's own chunk and not in the one the game, its cards and its
// rooms share (src/ui/three/copy3d.ts has every other line, and the
// figures' own words these lines are built from). House rules: numerals,
// no em or en dashes.

import { ADVERSARY, CONSTELLATION, SQUADRON } from '../../config'
import { ENDS_IT, SURE, billsOf, inTen, possibly, upTo, worstFace } from './copy3d'

// THE OPENING: the briefing as a camera move over the theater, the watch
// officer's four lines from the 3D title prototype (10 November 2026).
export const OPENING: readonly { clock: string; line: string; threat?: true }[] = [
  { clock: '21:00Z', line: `${CONSTELLATION} will be 9 smallsats. Tonight 2 are up, with 1 inspection bird.` },
  { clock: '21:04Z', line: `Under it, the ${SQUADRON} squadron flies flood relief over 3 counties. Every frame they shoot comes home through us.` },
  { clock: '21:09Z', line: `${ADVERSARY} is working the doors tonight: the uplink, the navigation signal, the people at the consoles.`, threat: true },
  { clock: '21:12Z', line: 'You are the mission assurance architect. 6 nights. Finish night 6 at 70 or above with the budget at 0 or more, and learn how they work.' },
]
export const OPENING_SPEAKER = 'WATCH OFFICER'
export const OPENING_NEXT = 'CONTINUE'
export const OPENING_GO = 'TAKE THE WATCH'
export const OPENING_SKIP = 'SKIP'
export const openingCount = (n: number, of: number) => `Briefing ${n} of ${of}`

// THE GUIDE: the first night teaches by doing. One short line a step.
export const GUIDE = {
  scan: 'SCAN: tap a signature below to identify it.',
  place: 'PLACE: 1 new defense a night. Tap one that answers it, or drag it onto an asset.',
  // The one rule the night turns on, said where it first matters (v2.0
  // R5: through R4 it was only in HOW TO PLAY on the title, and that
  // round's desktop player met "COLDVEIL switches" with no rule behind it).
  begin: `Ready. ${ADVERSARY} takes the move you cover least. BEGIN when your orders are set.`,
  // What an answer is for, said where the first one is offered (v2.0 R6:
  // the bot's first-time player spends its 3 on the first 3 moves that
  // ask, whatever they cost, and that habit alone is 16 games in 100 on
  // EASY: tests/policies.ts has the measurement beside the Novice).
  respond: 'ANSWER: 3 for all 6 nights. Spend 1 where a hit costs most, or let it ride.',
  tap: 'TAP as the ring closes on the target for a bonus.',
  done: 'That is the whole watch: scan, place, answer. The words on the cards are explained in the menu, under THE WORDS.',
  hold: 'YOUR CALL: read the 3 checks, then override the block or let it stand.',
} as const
export const GUIDE_SKIP = 'Skip guide'

// ------------------------------------------- as the player acts

// The post follows the newest defense, and the line says so as it moves.
export const postMoves = (from: string, to: string) => `The watch post moves from ${from} to ${to} with your newest defense: a strike there is 1 weaker.`
// A PIECE CHOSEN ON ONE ASSET'S CARD AND SET DOWN ON ANOTHER (v2.0 R6: two
// of R5's players chose a defense on a signature's card and were told it
// was "placed on" a different asset, with no reason). Chosen there, it
// goes on that signature's asset whenever the post does as much there as
// anywhere (gameModel.ts, spotAdvice, `near`). Where it does not, the
// reason is said: the piece covers the fleet from any asset, so it is set
// down where its post is worth most, under another move (`under`). (It
// can always sit on that asset: a defense sits on the layers its threats
// strike, and the signature is one of them.)
// Where it went comes first: a phone shows 2 lines of the watch officer's
// line before a tap opens the rest, and the round's reviewers read "covers
// the whole fleet wherever it sits,…" with the asset cut off.
export const sitsElse = (piece: string, near: string, sign: string, under?: string) => `${piece} sits on ${sign}, not ${near}: it covers the whole fleet from any asset, and its post does most ${under ? `under ${under}` : 'there'}.`
export const postMovesThere = (from: string) => `The watch post moves there from ${from}: a strike there is 1 weaker.`
// The piece cannot sit where the post is, and the post is holding down the
// night's costliest move: no spot is called best, and the card says what
// the piece gives up (v2.0 R4).
export const postCost = (sign: string, before: number, after: number) => `Placing it moves the watch post off ${sign}: AT STAKE goes from ${upTo(before)} to ${upTo(after)} tonight.`
export const postCostShort = (sign: string) => `moves the post off ${sign}: more at stake tonight`

// BEGIN ON A NIGHT THAT COULD END THE OPERATION (v2.0 R5; Ken's ruling of
// 18 November 2026: it keeps asking on any such night, and THE ASK CARRIES
// ITS REASON IN PLAIN WORDS, so a player who was asked and came through
// still trusts the next ask). It opens on the tile's own figure, so one
// screen never shows two, and then says what would have to happen: which
// moves would have to land unanswered (`by`: their names; an unidentified
// one is said as that, the debris as the debris), what their repairs and the upkeep come to against
// the budget in hand, that funding arrives after, and how likely it is. A
// player who is asked, begins, and sees one of those moves stopped knows
// why the worst did not come. It ends on what can be done: `ordered` is
// whether tonight's orders cost anything, so "take an order back" is never
// said to a player with nothing to take back, and `answers` whether the
// watch has one left.
//
// IT ASKS WHEREVER THE TILE READS SHORT, LIKELY OR NOT, AND SAYS WHICH
// (v2.0 R5). The first cut asked only when the break was more likely than
// not. That round's phone player then lost a game at 74.3, over the win
// line, on a last night that read "3 CR short" in amber: BEGIN went
// straight in, and "amber with no confirm" read as "probably fine". And
// the Mobile Safari player met "2 CR short", was told nothing, and ended
// 9 CR up: a warning with no odds is a false alarm when it does not come.
// So the tray's mark stays for what is likely, and BEGIN asks once about
// anything that can end the operation.
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const listOf = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0])
// WHAT THE WATCH CAN STILL DO ABOUT IT, AS A FIGURE (v2.0 R6). The round's
// first cut ended the reason with "An answer cuts a move's repair bill."
// Two of its three first-time players read that as a way out, began, and
// lost the operation above the win line: one with upkeep alone over the
// budget, where nothing in the night could help, and one against a move
// whose answer only halves, answered and still 3 CR short. So the ask
// says what the bills come to with the answers played (`eased`, with a
// hold on the debris, which takes no answer), and whether that is enough.
// The moves are named as the worst, not as tonight's ("At the worst,
// with ..."): the costliest on a track is not always the one that comes,
// and the second cut's reader took the names for a forecast.
export const riskLine = (r: { worst: number; odds: number; soon: boolean; risky: boolean; tonight: number; have: number; repairs: number; upkeep: number; eased: number; debris: number }, by: readonly string[], ordered: boolean, answers: boolean) => {
  const sure = r.odds > SURE
  // "Nothing is ordered:" read as a hint to order something (the reader of
  // the second cut); it is said as what it is.
  const none = 'There is no order to take back: tap BEGIN again.'
  const fix = ordered ? 'Take an order back, or tap BEGIN again.' : none
  if (r.worst >= 0) return `WORST CASE: ${worstFace(r.worst)}. Tonight holds, but tomorrow night's repairs and upkeep come out before its funding, and they are ${sure ? 'all but certain' : 'likely'} to take the budget under 0${sure ? '' : ` (${inTen(r.odds)})`}. That ends the operation, whatever the score. ${fix}`
  // Upkeep alone over the budget is not a chance, and is not said as one.
  if (r.upkeep > r.have) return `WORST CASE: ${worstFace(r.worst)}. Upkeep (${r.upkeep} CR) alone is more than your ${r.have} CR, and it comes out before funding arrives: ${ENDS_IT}. Nothing in the night can change that. ${ordered ? 'Take an order back.' : none}`
  const chance = r.soon ? (sure ? 'all but certain' : `the likely case (${inTen(r.odds)})`) : `${possibly(r.tonight)}${r.risky ? `, and ${sure ? 'all but certain' : 'likely'} by tomorrow night` : ''}`
  const named = r.repairs > 0 && by.length > 0
  const bills = billsOf(r.repairs, r.upkeep)
  const after = r.have - r.eased - r.upkeep
  // THE CHANCE IS THE CHANCE WITH THE ANSWERS PLAYED, AND SAYS SO. The
  // engine's odds spend the answers the watch holds on the moves that
  // land; said bare ("possible, not likely") the reader took them for the
  // odds whatever was done, on a night where riding out the one confirmed
  // move would have ended the operation.
  const eases = (answers || r.debris > 0) && r.eased < r.repairs
  const played = `${answers ? 'every move that lands answered' : ''}${answers && r.debris ? ' and ' : ''}${r.debris ? 'a hold on the debris' : ''}`
  const how = !eases
    ? `That is ${chance}.`
    : after >= 0
      ? `With ${played}, the worst leaves ${r.eased} CR of repairs and the budget holds.`
      : `Even with ${played}, the worst leaves ${r.eased} CR of repairs, ${-after} CR short. Played that way it is ${chance}.`
  return `WORST CASE: ${worstFace(r.worst)}. ${named ? `At the worst, with ${listOf(by)} landing unanswered, ${bills}` : cap(bills)} come${r.repairs ? '' : 's'} out of your ${r.have} CR before funding arrives, and ${ENDS_IT}. ${how} ${fix}`
}
