/**
 * Heuristic classifier for auto-thinking mode.
 * Analyzes a user message and returns the recommended thinking level.
 */

const HIGH_PHRASES = [
  'think hard', 'ultrathink', 'ultra think', 'deep think', 'think deeply',
  'think carefully', 'reason through', 'step by step',
  'analyze in depth', 'thorough analysis',
];

const HIGH_PATTERNS = [
  /architect/i, /debug.*complex/i, /refactor/i, /design pattern/i,
  /trade-?off/i, /pros?\s+(and|&)\s+cons?/i, /compare.*approach/i,
  /security (audit|review|analy)/i, /threat model/i,
  /explain (why|how).*work/i, /what('s| is) (wrong|the issue)/i,
  /root cause/i, /differential diagnosis/i,
];

const MEDIUM_PATTERNS = [
  /\bfix\b/i, /\bbug\b/i, /\bdebug\b/i, /\breview\b/i,
  /\bimplement\b/i, /\bbuild\b/i, /\bcreate\b/i, /\bwrite\b/i,
  /\boptimize\b/i, /\bimprove\b/i, /\bmigrate\b/i,
  /\bresearch\b/i, /\binvestigate\b/i, /\bdiagnose\b/i,
  /how (do|can|should|would)/i, /what (should|would|could)/i,
  /why (does|is|are|do|did)/i,
  /```/, // code blocks
];

const OFF_PATTERNS = [
  /^(hey|hi|hello|yo|sup|thanks|thank you|ok|okay|cool|nice|great|perfect|lol|haha|sure|yep|yup|nope|no|yes)\b/i,
  /^(tell me a joke|another|one more)/i,
  /^(good (morning|night|evening|afternoon))/i,
  /^\S+$/,  // single word
];

export type ThinkingLevel = null | 'low' | 'medium' | 'high';

export function classifyThinking(message: string): ThinkingLevel {
  const trimmed = message.trim();

  // Very short casual messages → off
  if (trimmed.length < 15) {
    for (const p of OFF_PATTERNS) {
      if (p.test(trimmed)) return null;
    }
  }

  // Check for explicit high-thinking phrases
  const lower = trimmed.toLowerCase();
  for (const phrase of HIGH_PHRASES) {
    if (lower.includes(phrase)) return 'high';
  }

  // Check high patterns
  for (const p of HIGH_PATTERNS) {
    if (p.test(trimmed)) return 'high';
  }

  // Check medium patterns
  for (const p of MEDIUM_PATTERNS) {
    if (p.test(trimmed)) return 'medium';
  }

  // Informational questions → low
  if (/^(what|who|where|when|which|tell me|list|name|show me)\b/i.test(trimmed) && trimmed.length > 15) {
    return 'low';
  }

  // Questions with ? that aren't super short → low
  if (trimmed.includes('?') && trimmed.length > 20) return 'low';

  // Long messages (>200 chars) likely need more thought
  if (trimmed.length > 200) return 'medium';

  // Messages with multiple sentences suggest complexity
  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) return 'low';

  // Medium-length messages (>50 chars) → low
  if (trimmed.length > 50) return 'low';

  // Default: off
  return null;
}
