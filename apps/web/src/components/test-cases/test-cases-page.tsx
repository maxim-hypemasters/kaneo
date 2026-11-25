import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TestCaseStatus } from "@/fetchers/test-case/types";
import { useProjectTestCases } from "@/hooks/queries/test-case/use-project-test-cases";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { NewTestCaseButton } from "./new-test-case-button";
import { TestCaseFilters } from "./test-case-filters";
import { TestCaseList } from "./test-case-list";
import { TestCasePagination } from "./test-case-pagination";
import { TestCaseQueryState } from "./test-case-query-state";

export function TestCasesPage({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 200).trim();
  const [status, setStatus] = useState<TestCaseStatus | null>(null);
  const [page, setPage] = useState(1);
  const result = useProjectTestCases(projectId, {
    ...(query ? { search: query } : {}),
    ...(status ? { status } : {}),
    page: String(page),
    limit: "50",
  });
  const filtered = Boolean(query || status);
  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="testCases"
      toolbar={<NewTestCaseButton projectId={projectId} />}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="text-xl font-semibold">{t("tasks:testCases.title")}</h1>
        <TestCaseFilters
          search={search}
          onSearchChange={(next) => {
            setSearch(next);
            setPage(1);
          }}
          status={status}
          onStatusChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          counts={result.data?.statusCounts}
        />
        {result.data ? (
          result.data.data.length ? (
            <>
              <TestCaseList testCases={result.data.data} />
              <TestCasePagination
                page={page}
                totalPages={result.data.pagination.totalPages}
                onPageChange={setPage}
              />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardCheck />
                </EmptyMedia>
                <EmptyTitle>
                  {t(
                    filtered
                      ? "tasks:testCases.noMatches"
                      : "tasks:testCases.emptyTitle",
                  )}
                </EmptyTitle>
                {!filtered && (
                  <EmptyDescription>
                    {t("tasks:testCases.emptyDescription")}
                  </EmptyDescription>
                )}
              </EmptyHeader>
            </Empty>
          )
        ) : (
          <TestCaseQueryState
            isPending={result.isPending}
            isError={result.isError}
            onRetry={() => void result.refetch()}
          />
        )}
      </div>
    </ProjectLayout>
  );
}
