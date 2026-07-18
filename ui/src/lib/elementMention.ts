export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

/** A selected element is stored separately from the prompt text. */
export interface ComposerMentionToken {
  tokenId: string;
  elementId: string;
  label: string;
  start: number;
  end: number;
}

const mentionCharacter = /^[\p{L}\p{N}_-]$/u;
const mentionBoundary = new Set([" ", "\t", "(", "["]);

/**
 * Finds the unfinished @mention immediately preceding a textarea caret.
 * It deliberately does not cross line boundaries, so multiline prompts remain independent.
 */
export function findMentionAtCaret(text: string, caret: number): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  let start = end;

  while (start > 0 && text[start - 1] !== "@" && text[start - 1] !== "\n") {
    if (!mentionCharacter.test(text[start - 1])) return null;
    start -= 1;
  }

  if (start === 0 || text[start - 1] !== "@") return null;
  const at = start - 1;
  const previous = text[at - 1];
  if (previous !== undefined && !mentionBoundary.has(previous) && previous !== "\n") return null;

  return { start: at, end, query: text.slice(start, end) };
}
