// US dollars with cents, and up to four decimals below one dollar so per-token
// prices such as $0.075 keep their precision.
export function formatUsd(value: number, locale?: string): string {
  const small = value !== 0 && Math.abs(value) < 1;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: small ? 4 : 2,
  }).format(value);
}
