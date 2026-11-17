import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { DefaultAllowanceField } from "./default-allowance-field";

const m = vi.hoisted(() => ({
  setDefault: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? [key, ...Object.values(options)].join("|") : key,
  }),
}));
vi.mock(
  "@/hooks/mutations/time-off/use-set-default-time-off-allowance",
  () => ({
    useSetDefaultTimeOffAllowance: () => ({
      mutateAsync: m.setDefault,
      isPending: false,
    }),
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: m.success, error: m.error },
}));

const field = () =>
  screen.getByRole("textbox", { name: "team:timeOff.types.sick" });

async function typeAndBlur(value: string) {
  fireEvent.change(field(), { target: { value } });
  await act(async () => {
    fireEvent.blur(field());
  });
}

beforeEach(() => {
  m.setDefault.mockReset().mockResolvedValue({});
  m.success.mockReset();
  m.error.mockReset();
  render(<DefaultAllowanceField workspaceId="w1" type="sick" value={25} />);
});

afterEach(() => cleanup());

describe("DefaultAllowanceField", () => {
  it("saves a changed default when the field is left", async () => {
    expect(field()).toHaveValue("25");

    await typeAndBlur("20");

    expect(m.setDefault).toHaveBeenCalledWith({ type: "sick", days: 20 });
    expect(m.success).toHaveBeenCalledWith(
      "settings:workspaceTimeOff.defaultSaved|team:timeOff.types.sick|20",
    );
  });

  it("saves nothing when the value didn't change", async () => {
    await typeAndBlur("25");

    expect(m.setDefault).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    m.setDefault.mockRejectedValue(new Error("Workspace plan expired"));

    await typeAndBlur("20");

    expect(m.success).not.toHaveBeenCalled();
    expect(m.error).toHaveBeenCalledWith("Workspace plan expired");
  });

  it("needs a value", async () => {
    await typeAndBlur("");

    expect(m.setDefault).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });
});
