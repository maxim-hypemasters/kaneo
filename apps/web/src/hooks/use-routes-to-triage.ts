import { useContext } from "react";
import { AuthContext } from "@/components/providers/auth-provider";
import { useGetTriageMembers } from "@/hooks/queries/triage/use-get-triage-members";
import { routesToTriage } from "@/lib/triage/can-triage";

// Whether new Tasks and Bugs from the current user wait in Triage. The note
// it drives is optional, so a missing session just hides it.
export function useRoutesToTriage(projectId: string | undefined) {
  const userId = useContext(AuthContext)?.user?.id;
  const { data: memberIds } = useGetTriageMembers(projectId);
  return routesToTriage(userId, memberIds);
}
