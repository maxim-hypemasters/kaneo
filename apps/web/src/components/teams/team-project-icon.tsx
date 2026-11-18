import icons from "@/constants/project-icons";

export function TeamProjectIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const Icon = icons[(icon ?? "Layout") as keyof typeof icons] ?? icons.Layout;
  return <Icon aria-hidden="true" className={className} />;
}
