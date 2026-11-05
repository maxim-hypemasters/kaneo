const UNIT_MINUTES = { w: 5 * 8 * 60, d: 8 * 60, h: 60, m: 1 } as const;
const MAX_ESTIMATE_SECONDS = 2_147_483_640;

export function estimateToSeconds(input: string): number | null | undefined {
  const text = input.trim();
  if (!text) return null;
  if (text.length > 100) return undefined;
  const token = /(\d+(?:\.\d+)?|\.\d+)\s*([wdhm])\s*/iy;
  const units = new Set<string>();
  let minutes = 0;
  let cursor = 0;
  while (cursor < text.length) {
    token.lastIndex = cursor;
    const match = token.exec(text);
    if (!match) return undefined;
    const unit = match[2]!.toLowerCase() as keyof typeof UNIT_MINUTES;
    if (units.has(unit)) return undefined;
    units.add(unit);
    minutes += Number(match[1]) * UNIT_MINUTES[unit];
    cursor = token.lastIndex;
  }
  const roundedMinutes = Math.round(minutes);
  if (
    !Number.isFinite(minutes) ||
    roundedMinutes < 1 ||
    Math.abs(minutes - roundedMinutes) > 0.000_001 ||
    roundedMinutes * 60 > MAX_ESTIMATE_SECONDS
  )
    return undefined;
  return roundedMinutes * 60;
}

export function formatEstimate(seconds: number | null | undefined) {
  if (seconds == null) return "";
  let remaining = Math.round(seconds / 60);
  const parts: string[] = [];
  for (const unit of ["w", "d", "h", "m"] as const) {
    const amount = Math.floor(remaining / UNIT_MINUTES[unit]);
    if (amount) parts.push(`${amount}${unit}`);
    remaining %= UNIT_MINUTES[unit];
  }
  return parts.join(" ");
}
