const DEFAULT_MAX_LENGTH = 15000;

const suffix = "... [truncated]";

/**
 * Trim text to the configured max length, preferring whitespace boundaries.
 * Logs the original and final lengths for observability.
 *
 * @param {string} input
 * @param {object} options
 * @param {number} [options.maxLength]
 * @returns {string}
 */
export default function truncateText(input, { maxLength } = {}) {
  const text = typeof input === "string" ? input : String(input ?? "");
  const envLimit = Number(process.env.MAX_PROMPT_LENGTH);
  const limit = Number.isFinite(maxLength)
    ? maxLength
    : Number.isFinite(envLimit) && envLimit > 0
      ? envLimit
      : DEFAULT_MAX_LENGTH;

  if (text.length <= limit) {
    console.info(
      `[truncateText] length ${text.length} -> ${text.length} (no truncation)`,
    );
    return text;
  }

  const slice = text.slice(0, Math.max(0, limit - suffix.length - 1));
  const lastWhitespace = slice.lastIndexOf(" ");
  const trimmedBase =
    lastWhitespace > 0 ? slice.slice(0, lastWhitespace) : slice.trimEnd();

  const result = `${trimmedBase}${suffix}`;
  console.warn(
    `[truncateText] length ${text.length} -> ${result.length} (truncated)`,
  );
  return result;
}
