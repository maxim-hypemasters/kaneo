// "#12 Crash on launch", or the title alone for a bug without a number.
export function bugLabel(bug: { number: number | null; title: string }) {
  return bug.number === null ? bug.title : `#${bug.number} ${bug.title}`;
}
