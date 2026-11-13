import { Diamond } from "lucide-react";
import { useId } from "react";

// A milestone's diamond, filled clockwise from the top by `ratio` (0 to 1)
// and solid when done. The fill follows the text colour.
export function ProgressDiamond({
  ratio,
  className,
}: {
  ratio: number;
  className?: string;
}) {
  const clipId = useId();
  const shown = Math.min(1, Math.max(0, ratio));
  const partial = shown > 0 && shown < 1;
  const angle = shown * 2 * Math.PI;
  const sector = `M 12 12 L 12 -12 A 24 24 0 ${shown > 0.5 ? 1 : 0} 1 ${12 + 24 * Math.sin(angle)} ${12 - 24 * Math.cos(angle)} Z`;

  return (
    <Diamond
      aria-hidden="true"
      className={className}
      fill={shown === 1 ? "currentColor" : "none"}
    >
      {partial && (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={sector} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <Diamond fill="currentColor" stroke="none" />
          </g>
        </>
      )}
    </Diamond>
  );
}
