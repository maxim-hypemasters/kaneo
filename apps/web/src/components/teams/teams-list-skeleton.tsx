import { SettingsCard } from "@/components/settings/settings-card";
import { Skeleton } from "@/components/ui/skeleton";

export function TeamsListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map((index) => (
        <SettingsCard key={index}>
          <div className="space-y-2 px-4 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </SettingsCard>
      ))}
    </div>
  );
}
