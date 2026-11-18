import { readTestCaseResponse } from "./read-test-case-response";
import type { TestCaseCollection, TestCaseList } from "./types";

// Reads every page; the status counts cover the whole set on each page.
export async function collectTestCasePages(
  readPage: (page: string) => Promise<Response>,
): Promise<TestCaseCollection> {
  const first = await readTestCaseResponse<TestCaseList>(await readPage("1"));
  const data = [...first.data];
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const next = await readTestCaseResponse<TestCaseList>(
      await readPage(String(page)),
    );
    data.push(...next.data);
  }
  return { data, statusCounts: first.statusCounts };
}
