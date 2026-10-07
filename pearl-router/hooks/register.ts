import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { RouterMode } from '../types'
import { classify, EFFORT, escalate, OPUS, SONNET } from './route'
import type { Tier } from './route'

const mode = atom({ plugin: 'pearl-router', key: 'mode' } as const, 'auto')
const FORCE = /^\s*!(opus|sonnet)\b\s*/i
const MODES: readonly RouterMode[] = ['auto', 'opus', 'sonnet', 'off']
const label = (t: Tier) => (t === 'opus' ? 'Opus 5.5' : 'Sonnet 5.5')

export const register: Register = on => {
  let tier: Tier = 'sonnet'
  let lastTier: Tier | undefined
  let why = ''
  let forced = false
  let escalated = false
  let toolErrors = 0

  const statusText = () => `router: ${label(tier)} medium (${why})`

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'router',
      description: 'Model router: /router auto|opus|sonnet|off|status',
    })
    return next(e)
  })

  on('command.run', { command: 'router' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if ((MODES as readonly string[]).includes(arg)) {
      await update($, mode, () => arg as RouterMode)
      $.ui.status(arg === 'off' ? undefined : `router: ${arg}`)
      return { text: `Router mode: ${arg}` }
    }
    const m = await read($, mode)
    return {
      text: `Router mode: ${m}. Last pick: ${lastTier ? label(lastTier) : 'none'}${why ? ` (${why})` : ''}. ` +
        'Use /router auto|opus|sonnet|off, or prefix a prompt with !opus or !sonnet.',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    const m = await read($, mode)
    toolErrors = 0
    escalated = false
    forced = false
    let text = e.text

    const hit = FORCE.exec(text)
    if (hit) {
      forced = true
      tier = (hit[1] ?? "sonnet").toLowerCase() as Tier
      why = 'forced'
      text = text.replace(FORCE, '')
    } else if (m === 'opus' || m === 'sonnet') {
      tier = m
      why = 'pinned'
    } else if (m === 'auto') {
      const d = classify(text, { attachments: e.attachments?.length, lastTier })
      tier = d.tier
      why = d.reasons.slice(0, 3).join(', ') || `score ${d.score}`
    }

    if (m !== 'off' || forced) {
      lastTier = tier
      $.ui.status(statusText())
    }
    return next(text === e.text ? e : { ...e, text })
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError === true) toolErrors += 1
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const m = await read($, mode)
    // Subagents keep the model they were given; "off" leaves the session's model alone
    if (e.agentId !== undefined || (m === 'off' && !forced)) {
      return yield* next(e)
    }

    if (m === 'auto' && !forced && tier === 'sonnet') {
      const reason = escalate({ step: e.index, messageCount: e.messageCount, toolErrors })
      if (reason) {
        tier = 'opus'
        lastTier = 'opus'
        why = `escalated: ${reason}`
        if (!escalated) $.ui.toast(`Router: switching to Opus 5.5 (${reason})`)
        escalated = true
        $.ui.status(statusText())
      }
    }

    return yield* next({ ...e, model: tier === 'opus' ? OPUS : SONNET, effort: EFFORT })
  })
}
