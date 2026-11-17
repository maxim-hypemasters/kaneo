import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { AssistantMarkdown } from "./assistant-markdown";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

const renderAnswer = (content: string) =>
  render(<AssistantMarkdown content={content} workspaceSlug="acme" />);

// Clicks the router leaves alone would make jsdom navigate; the browser's
// default is all that matters here.
function clickWithoutLeaving(link: HTMLElement, init?: MouseEventInit) {
  const block = (event: Event) => event.preventDefault();
  window.addEventListener("click", block);
  fireEvent.click(link, init);
  window.removeEventListener("click", block);
}

describe("AssistantMarkdown", () => {
  it("renders GitHub-flavoured Markdown", () => {
    const { container } = renderAnswer(
      "**Bold** and ~~gone~~\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- one\n- two",
    );
    expect(container.querySelector("strong")).toHaveTextContent("Bold");
    expect(container.querySelector("del")).toHaveTextContent("gone");
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("never renders images, raw HTML or scripts", () => {
    const { container } = renderAnswer(
      '![Chart](https://evil.example/beacon.png)\n\n<img src="x" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n<b>raw</b>',
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");

    const imageLink = screen.getByRole("link", { name: /Chart/ });
    expect(imageLink).toHaveAttribute(
      "href",
      "https://evil.example/beacon.png",
    );
    expect(imageLink).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  it("opens other sites in a new tab without a referrer", () => {
    renderAnswer("[Docs](https://example.com/docs) and [CDN](//cdn.example)");
    for (const name of [/Docs/, /CDN/]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    }
    clickWithoutLeaving(screen.getByRole("link", { name: /CDN/ }));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("drops unsafe link schemes", () => {
    const { container } = renderAnswer(
      "[Click](javascript:alert(1)) [Data](data:text/html,hi) [Tab](java&#9;script:alert(1))",
    );
    expect(container).toHaveTextContent("Click Data Tab");
    // Markdown percent-encodes the tab, which leaves a harmless relative
    // path; nothing may resolve to a scheme other than http(s).
    for (const link of container.querySelectorAll("a")) {
      const href = link.getAttribute("href") ?? "";
      expect(new URL(href, "https://kaneo.test/").protocol).toMatch(
        /^https?:$/,
      );
    }
    expect(screen.queryByRole("link", { name: "Click" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Data" })).toBeNull();
  });

  it("routes Kaneo links inside the app", () => {
    renderAnswer(
      "[KAN-12](/acme/task/KAN-12) and [Page](/dashboard/workspace/w1/project/p1?tab=documents&documentId=d1)",
    );
    const task = screen.getByRole("link", { name: "KAN-12" });
    expect(task).not.toHaveAttribute("target");

    fireEvent.click(task);
    expect(navigate).toHaveBeenLastCalledWith({ href: "/acme/task/KAN-12" });

    fireEvent.click(screen.getByRole("link", { name: "Page" }));
    expect(navigate).toHaveBeenLastCalledWith({
      href: "/dashboard/workspace/w1/project/p1?tab=documents&documentId=d1",
    });

    // A modified click keeps the browser's own behaviour (a new tab).
    navigate.mockReset();
    clickWithoutLeaving(task, { metaKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves other workspaces' permalinks to the browser", () => {
    renderAnswer("[Other](/other/task/OT-1)");
    clickWithoutLeaving(screen.getByRole("link", { name: "Other" }));
    expect(navigate).not.toHaveBeenCalled();
  });
});
