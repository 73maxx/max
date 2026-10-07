export const OPUS = 'claude-opus-5-5'
export const SONNET = 'claude-sonnet-5-5'
export const EFFORT = 'medium' as const

export type Tier = 'opus' | 'sonnet'
export type Decision = { tier: Tier; score: number; reasons: string[] }

// Signals that a prompt needs deeper reasoning
const HEAVY: [RegExp, number, string][] = [
  [/\b(architect(ure)?|design (a|the)|system design|trade-?offs?)\b/i, 3, 'design'],
  [/\b(refactor|migrat(e|ion)|rewrite|overhaul|port)\b/i, 3, 'refactor'],
  [/\b(debug|root cause|stack ?trace|race condition|deadlock|memory leak|segfault|why (does|is|did)n?'?t?)\b/i, 3, 'debugging'],
  [/\b(implement|build|create|write) (a|an|the)?\s*(new )?(feature|service|api|app|module|mod|plugin|system|pipeline|parser|compiler)\b/i, 3, 'build'],
  [/\b(prove|proof|derive|algorithm|complexity|optimi[sz]e|performance)\b/i, 2, 'reasoning'],
  [/\b(security|vulnerab|exploit|threat model|audit|cve)\b/i, 2, 'security'],
  [/\b(research|investigate|analy[sz]e|compare|evaluate|deep dive)\b/i, 2, 'analysis'],
  [/\b(plan|strategy|roadmap|step[- ]by[- ]step)\b/i, 1, 'planning'],
  [/\b(across|entire|whole|all) (the )?(repo|codebase|project|files)\b/i, 3, 'repo-wide'],
  [/\b(think (hard|carefully)|be thorough|thoroughly|carefully)\b/i, 2, 'asked for depth'],
]

// Signals that a prompt is light work
const LIGHT: [RegExp, number, string][] = [
  [/^(hi|hey|hello|thanks|thank you|ok|okay|cool|nice|great)\b/i, 3, 'chat'],
  [/\b(rename|typo|spelling|format|reformat|lint|indent|bump|commit|push|status)\b/i, 2, 'small edit'],
  [/\b(summari[sz]e|tl;?dr|translate|rephrase|reword|shorten|list|what is|define)\b/i, 2, 'simple task'],
  [/\b(quick|simple|small|tiny|minor|just)\b/i, 1, 'stated small'],
]

const FOLLOW_UP = /^(yes|yep|y|go|go ahead|continue|keep going|do it|proceed|next|and\b|also\b|now\b|ok,? )/i

/** Scores a prompt; >= 3 goes to Opus */
export function classify(
  text: string,
  opts: { attachments?: number; lastTier?: Tier } = {},
): Decision {
  const reasons: string[] = []
  let score = 0
  const t = text.trim()

  for (const [re, w, why] of HEAVY) if (re.test(t)) { score += w; reasons.push(why) }
  for (const [re, w, why] of LIGHT) if (re.test(t)) { score -= w; reasons.push(why) }

  if (t.length > 1500) { score += 3; reasons.push('long prompt') }
  else if (t.length > 500) { score += 1; reasons.push('medium prompt') }
  else if (t.length < 60) { score -= 1 }

  const fences = (t.match(/```/g) ?? []).length / 2
  if (fences >= 1) { score += fences >= 2 ? 2 : 1; reasons.push('code') }

  const asks = (t.match(/\?/g) ?? []).length + (t.match(/^\s*(\d+[.)]|[-*]|[a-z][.)])\s/gim) ?? []).length
  if (asks >= 4) { score += 2; reasons.push('multi-part') }

  if (opts.attachments) { score += 1; reasons.push('attachments') }

  // Short follow-ups inherit the previous tier so a heavy task is not dropped mid-way
  if (opts.lastTier && t.length < 120 && FOLLOW_UP.test(t)) {
    return { tier: opts.lastTier, score, reasons: [...reasons, `follow-up keeps ${opts.lastTier}`] }
  }

  return { tier: score >= 3 ? 'opus' : 'sonnet', score, reasons }
}

export type Load = { step: number; messageCount: number; toolErrors: number }

/** Escalates a Sonnet turn to Opus once the workload grows */
export function escalate(load: Load): string | undefined {
  if (load.toolErrors >= 2) return `${load.toolErrors} tool errors`
  if (load.step >= 12) return `step ${load.step}`
  if (load.messageCount >= 150) return `${load.messageCount} messages in context`
  return undefined
}
