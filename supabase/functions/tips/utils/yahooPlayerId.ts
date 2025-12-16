/**
 * Extract numeric Yahoo player ID from full format
 * Yahoo stores player IDs as "461.p.40042" but the DOM uses just "40042"
 *
 * @param fullId - Full Yahoo player ID (e.g., "461.p.40042")
 * @returns Numeric portion of the ID (e.g., "40042")
 */
export function extractYahooPlayerId(
  fullId: string | null | undefined
): string {
  if (!fullId) return '';
  const parts = fullId.split('.');
  return parts.length >= 3 ? parts[2] : fullId;
}

