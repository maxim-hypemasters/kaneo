import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AwayBadge } from "./away-badge";

type WithAwayBadgeProps = {
  // "Away until Nov 20", or nothing when the member is not away.
  label?: string;
  children: ReactNode;
  badgeClassName?: string;
  decorative?: boolean;
};

// Puts the away badge on the bottom corner of an avatar. Avatars clip their
// content, so the badge sits on a wrapper instead.
export function WithAwayBadge({
  label,
  children,
  badgeClassName,
  decorative,
}: WithAwayBadgeProps) {
  if (!label) return children;
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <AwayBadge
        label={label}
        decorative={decorative}
        className={cn("-bottom-0.5 -end-0.5 absolute", badgeClassName)}
      />
    </span>
  );
}
