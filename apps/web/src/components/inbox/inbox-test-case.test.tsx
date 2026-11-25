import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { InboxTestCase } from "./inbox-test-case";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    search?: Record<string, string>;
    children?: ReactNode;
  }) => (
    <a
      {...props}
      data-search={JSON.stringify(search)}
      href={to.replace(/\$(\w+)/g, (_, name: string) => params[name] ?? "")}
    >
      {children}
    </a>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

describe("InboxTestCase", () => {
  it("links to the test case over its project's Test cases page", () => {
    render(
      <InboxTestCase
        testCaseId="tc-1"
        workspaceId="w-1"
        eventData={{ testCaseTitle: "Checks out", projectId: "p-1" }}
      />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Checks out");
    const link = screen.getByRole("link", {
      name: "notifications:inbox.openTestCase",
    });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/workspace/w-1/project/p-1/test-cases",
    );
    expect(link).toHaveAttribute(
      "data-search",
      JSON.stringify({ testCaseId: "tc-1" }),
    );
  });

  it("shows no link when the notification doesn't say which project", () => {
    render(
      <InboxTestCase testCaseId="tc-1" workspaceId="w-1" eventData={null} />,
    );
    expect(screen.getByRole("heading")).toHaveTextContent(
      "tasks:testCases.singular",
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
