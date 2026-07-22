// Zod schemas for all content (spec Sections 10 and 11.3). Content is
// data, not code; it does not ship unless it parses.

import { z } from 'zod'

export const techniqueRefSchema = z.object({
  framework: z.enum(['SPARTA', 'ATLAS', 'ATTACK', 'ATTACK_ICS', 'NSA', 'RESEARCH']),
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  status: z.enum(['verified', 'verify-at-build']),
  citation: z.string().optional(),
})

export const learnMoreSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  type: z.enum(['paper', 'report', 'advisory']),
  status: z.enum(['verified', 'verify-at-build']),
})

// Every event teaches: at least one card, every card sourced.
export const learnMoreCardSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  sources: z.array(learnMoreSourceSchema).min(1),
})

export const countermeasureIdSchema = z.enum([
  'linkAuth',
  'antiJam',
  'pntAuth',
  'sensorFusion',
  'tierAAttestation',
  'mlPipelineIntegrity',
  'groundZeroTrust',
  'insiderProgram',
  'ssaManeuver',
  'encryptedBackhaul',
  'intelInvestment',
  'irRetainer',
])

export const spartaCmRefSchema = z.object({
  id: z.string().regex(/^CM\d{4}$/),
  name: z.string().min(1),
  url: z.string().url(),
  tier: z.string().min(1),
})

export const countermeasureSchema = z.object({
  id: countermeasureIdSchema,
  name: z.string().min(1),
  cost: z.number().int().min(0).max(15),
  counters: z.array(z.string().min(1)),
  spartaCms: z.array(spartaCmRefSchema),
  blurb: z.string().min(1),
})

export const threatEffectSchema = z.object({
  meters: z.array(z.enum(['linkAvailability', 'dataIntegrity', 'sensorIntegrity'])),
  special: z.enum(['jamsGnss', 'chainExploit', 'implantTierB', 'debrisStrike']).optional(),
  assetDamage: z.boolean().optional(),
  repairCostPerSeverity: z.number().int().min(0),
})

export const threatEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  layers: z.array(z.enum(['ORBIT', 'AIR', 'GROUND'])).min(1),
  vector: z.enum(['rf', 'optical', 'cyber', 'supplyChain', 'human', 'environmental']),
  baseSeverity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  counters: z.array(countermeasureIdSchema),
  techniqueRefs: z.array(techniqueRefSchema).min(1), // every event carries at least one ref
  chainsWith: z.array(z.string()).optional(),
  effect: threatEffectSchema,
  blurb: z.string().min(1),
  learnMoreCards: z.array(learnMoreCardSchema).min(1),
})

const assetKindSchema = z.enum(['sat', 'rpoSat', 'drone', 'groundStation'])
const tierSchema = z.enum(['A', 'B'])

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    totalTurns: z.number().int().min(1),
    startCredits: z.number().int().min(0),
    incomePerTurn: z.number().int().min(0),
    slaBonus: z.object({ coverageMin: z.number().min(0).max(100), credits: z.number().int().min(0) }),
    winThreshold: z.number().min(0).max(100),
    collapseThreshold: z.number().min(0).max(100),
    maiWeights: z.object({
      coverage: z.number().positive(),
      linkAvailability: z.number().positive(),
      dataIntegrity: z.number().positive(),
      sensorIntegrity: z.number().positive(),
    }),
    prices: z.object({
      sat: z.number().int().positive(),
      rpoSat: z.number().int().positive(),
      drone: z.number().int().positive(),
      groundStation: z.number().int().positive(),
      tierAUpcharge: z.object({ sat: z.number().int().min(0), drone: z.number().int().min(0) }),
      intelLevels: z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]),
    }),
    recovery: z.object({ base: z.number().int().min(0), withIrRetainer: z.number().int().min(0) }),
    starterAssets: z.array(z.object({ kind: assetKindSchema, tier: tierSchema })).min(1),
    campaign: z.array(
      z.object({
        turn: z.number().int().min(1),
        slots: z.array(
          z
            .object({ fixed: z.string().optional(), drawFrom: z.array(z.string()).min(1).optional() })
            .refine((s) => (s.fixed ? !s.drawFrom : !!s.drawFrom), {
              message: 'slot must have exactly one of fixed or drawFrom',
            }),
        ),
      }),
    ),
    briefIntro: z.string().min(1),
    events: z.array(threatEventSchema).min(1),
    countermeasures: z.array(countermeasureSchema).min(1),
  })
  .superRefine((s, ctx) => {
    const eventIds = new Set(s.events.map((e) => e.id))
    if (eventIds.size !== s.events.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate event ids' })
    }
    const counterIds = new Set(s.countermeasures.map((c) => c.id))
    if (counterIds.size !== s.countermeasures.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate countermeasure ids' })
    }
    // Full-deck rule (R3): an event that no campaign slot can ever draw is
    // dead content and fails validation.
    const reachable = new Set<string>()
    for (const plan of s.campaign) {
      for (const slot of plan.slots) {
        if (slot.fixed) reachable.add(slot.fixed)
        for (const id of slot.drawFrom ?? []) reachable.add(id)
      }
    }
    for (const ev of s.events) {
      if (!reachable.has(ev.id)) {
        ctx.addIssue({ code: 'custom', message: `event ${ev.id} is never reachable in the campaign` })
      }
    }
    const seenTurns = new Set<number>()
    for (const plan of s.campaign) {
      if (plan.turn > s.totalTurns) {
        ctx.addIssue({ code: 'custom', message: `campaign turn ${plan.turn} exceeds totalTurns` })
      }
      if (seenTurns.has(plan.turn)) {
        ctx.addIssue({ code: 'custom', message: `duplicate campaign entry for turn ${plan.turn}` })
      }
      seenTurns.add(plan.turn)
      for (const slot of plan.slots) {
        for (const id of [slot.fixed, ...(slot.drawFrom ?? [])]) {
          if (id && !eventIds.has(id)) {
            ctx.addIssue({ code: 'custom', message: `campaign references unknown event ${id}` })
          }
        }
      }
    }
    for (const ev of s.events) {
      for (const cid of ev.counters) {
        if (!counterIds.has(cid)) {
          ctx.addIssue({ code: 'custom', message: `event ${ev.id} references unknown countermeasure ${cid}` })
        }
      }
      for (const chained of ev.chainsWith ?? []) {
        if (!eventIds.has(chained)) {
          ctx.addIssue({ code: 'custom', message: `event ${ev.id} chainsWith unknown event ${chained}` })
        }
      }
    }
    // The two counter maps must agree in both directions: the engine reads
    // event.counters, the catalog documents countermeasure.counters, and a
    // mismatch would ship a card that lies about what it mitigates.
    for (const cm of s.countermeasures) {
      for (const eid of cm.counters) {
        if (!eventIds.has(eid)) {
          ctx.addIssue({ code: 'custom', message: `countermeasure ${cm.id} counters unknown event ${eid}` })
        }
        const ev = s.events.find((e) => e.id === eid)
        if (ev && !ev.counters.includes(cm.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `countermeasure ${cm.id} claims to counter ${eid}, but event ${eid} does not list it`,
          })
        }
      }
    }
    for (const ev of s.events) {
      for (const cid of ev.counters) {
        const cm = s.countermeasures.find((c) => c.id === cid)
        if (cm && !cm.counters.includes(ev.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `event ${ev.id} lists counter ${cid}, but countermeasure ${cid} does not claim it`,
          })
        }
      }
    }
  })
