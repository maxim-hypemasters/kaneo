// A whole Jan-Dec year as an inclusive window of days (YYYY-MM-DD): at most
// 366 days, the longest window the time-off calendar accepts.
export function yearWindow(year: number) {
  const padded = String(year).padStart(4, "0");
  return { from: `${padded}-01-01`, to: `${padded}-12-31` };
}
