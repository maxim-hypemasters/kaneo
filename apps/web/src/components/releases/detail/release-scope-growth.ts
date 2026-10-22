type ScopeGrowth =
  | { kind: "percent"; percent: number }
  | { kind: "added"; count: number }
  | { kind: "unknown" | "upcoming" };

export function releaseScopeGrowth(
  startScope: number | null | undefined,
  currentScope: number,
  upcoming: boolean,
): ScopeGrowth {
  if (upcoming) return { kind: "upcoming" };
  if (startScope == null) return { kind: "unknown" };
  if (startScope === 0) {
    return currentScope === 0
      ? { kind: "percent", percent: 0 }
      : { kind: "added", count: currentScope };
  }
  const change = currentScope - startScope;
  const magnitude = Math.round((Math.abs(change) / startScope) * 100);
  return {
    kind: "percent",
    percent: Math.sign(change) * magnitude || 0,
  };
}
