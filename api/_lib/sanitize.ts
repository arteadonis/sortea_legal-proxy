/**
 * Input sanitization utilities to mitigate prompt injection attacks.
 * All user-provided strings must be sanitized before interpolation into LLM prompts.
 */

/** Strip control characters, excessive whitespace, and prompt-breaking delimiters. */
export function sanitizeField(input: string, maxLength: number): string {
  return input
    // Remove control characters (except newline/tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Collapse triple-quote fences that could break prompt delimiters
    .replace(/"""/g, '"')
    .replace(/```/g, '`')
    // Trim and limit length
    .trim()
    .slice(0, maxLength);
}

/** Sanitize a username: allow only alphanumeric, underscore, dot. */
export function sanitizeUsername(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 60);
}

/** Sanitize an array of strings with a per-item length limit and array size cap. */
export function sanitizeArray(
  items: unknown,
  maxItems: number,
  maxItemLength: number,
): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is string => typeof item === 'string')
    .slice(0, maxItems)
    .map((item) => sanitizeField(item, maxItemLength));
}
