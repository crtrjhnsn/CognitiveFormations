// Model choices live in config so they can change without code edits.
// The re-solve check uses a different, stronger model than drafting.
export const DRAFT_MODEL = process.env.CLAUDE_DRAFT_MODEL ?? "claude-sonnet-5-5";
export const CHECK_MODEL = process.env.CLAUDE_CHECK_MODEL ?? "claude-opus-5-5";
