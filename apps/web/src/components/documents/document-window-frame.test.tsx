import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { DocumentWindow } from "./document-window";
import { DocumentWindowFrame } from "./document-window-frame";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const NAV = "common:documentWindow.navLabel";

function stubWidth(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: wide,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })),
  );
}

// Two documents and a list that switches between them, as the Documents tab
// wires it.
function Documents({
  onClose = () => {},
  closeDisabled = false,
}: {
  onClose?: () => void;
  closeDisabled?: boolean;
}) {
  const [open, setOpen] = useState("alpha");
  return (
    <DocumentWindowFrame
      documentKey={open}
      onClose={onClose}
      nav={
        <ul>
          {["alpha", "beta"].map((id) => (
            <li key={id}>
              <button type="button" onClick={() => setOpen(id)}>
                Open {id}
              </button>
            </li>
          ))}
        </ul>
      }
    >
      <DocumentWindow
        key={open}
        title={`Document ${open}`}
        onClose={onClose}
        closeDisabled={closeDisabled}
      >
        <h1>Body of {open}</h1>
      </DocumentWindow>
    </DocumentWindowFrame>
  );
}

const toggle = () => screen.getByRole("button", { name: NAV });
const nav = () => screen.queryByRole("navigation", { name: NAV });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DocumentWindowFrame beside a wide document", () => {
  beforeEach(() => stubWidth(true));

  it("keeps the same window while the list switches documents", () => {
    render(<Documents />);
    const dialog = screen.getByRole("dialog", { name: "Document alpha" });
    expect(nav()).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Open beta" }));

    expect(screen.getByRole("heading", { name: "Body of beta" })).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Document beta" })).toBe(dialog);
    expect(nav()).toBeVisible();
  });

  it("hides the list and remembers that for the next document opened", () => {
    render(<Documents />);
    expect(toggle()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle());

    expect(nav()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    cleanup();
    render(<Documents />);
    expect(nav()).toBeNull();
    fireEvent.click(toggle());
    expect(nav()).toBeVisible();
  });
});

describe("DocumentWindowFrame over a narrow document", () => {
  beforeEach(() => stubWidth(false));

  it("shows the list only until a document is picked", () => {
    render(<Documents />);
    expect(nav()).toBeNull();

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Open beta" }));

    expect(screen.getByRole("heading", { name: "Body of beta" })).toBeVisible();
    expect(nav()).toBeNull();
  });

  it("closes the list on Escape and leaves the document open", () => {
    const onClose = vi.fn();
    render(<Documents onClose={onClose} />);
    fireEvent.click(toggle());

    fireEvent.keyDown(screen.getByRole("button", { name: "Open beta" }), {
      key: "Escape",
    });

    expect(nav()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});

describe("DocumentWindow on its own", () => {
  it("opens its own window without a documents list", () => {
    const onClose = vi.fn();
    render(
      <DocumentWindow title="Loose" onClose={onClose}>
        <p>Text</p>
      </DocumentWindow>,
    );
    expect(screen.getByRole("dialog", { name: "Loose" })).toBeVisible();
    expect(screen.queryByRole("button", { name: NAV })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: /tasks:features\.workspace\.allDocuments/,
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("DocumentWindowFrame and Escape", () => {
  beforeEach(() => stubWidth(true));

  it("closes the document", () => {
    const onClose = vi.fn();
    render(<Documents onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("heading", { name: "Body of alpha" }), {
      key: "Escape",
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("is ignored while closing would lose work", () => {
    const onClose = vi.fn();
    render(<Documents onClose={onClose} closeDisabled />);

    fireEvent.keyDown(screen.getByRole("heading", { name: "Body of alpha" }), {
      key: "Escape",
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
