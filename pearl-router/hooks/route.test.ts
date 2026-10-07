import { describe, expect, test } from 'claude-code/testing'

import { classify, escalate } from './route'

describe('classify', () => {
  test('heavy prompts go to Opus', () => {
    expect(classify('Refactor the auth module across the entire codebase and debug the race condition').tier).toBe('opus')
    expect(classify('Design a system architecture for a realtime chat with trade-offs').tier).toBe('opus')
  })
  test('light prompts go to Sonnet', () => {
    expect(classify('thanks!').tier).toBe('sonnet')
    expect(classify('fix the typo in the README').tier).toBe('sonnet')
    expect(classify('summarize this paragraph').tier).toBe('sonnet')
  })
  test('follow-ups keep the previous tier', () => {
    expect(classify('yes go ahead', { lastTier: 'opus' }).tier).toBe('opus')
  })
})

describe('escalate', () => {
  test('stays put under light load', () => {
    expect(escalate({ step: 2, messageCount: 20, toolErrors: 0 })).toBe(undefined)
  })
  test('escalates on heavy load', () => {
    expect(escalate({ step: 12, messageCount: 20, toolErrors: 0 })).toBe('step 12')
    expect(escalate({ step: 1, messageCount: 20, toolErrors: 2 })).toBe('2 tool errors')
  })
})
