import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { FeatureChip } from "./feature-chip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}|${values.title}` : key,
  }),
}));

afterEach(cleanup);

it("names the feature and opens it without reaching the card", () => {
  const onOpen = vi.fn();
  const onCardClick = vi.fn();
  render(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- reproduces the card click boundary
    <div onClick={onCardClick}>
      <FeatureChip feature={{ id: "f", title: "Checkout" }} onOpen={onOpen} />
    </div>,
  );

  const chip = screen.getByRole("button", {
    name: "tasks:features.chipLabel|Checkout",
  });
  expect(chip).toHaveTextContent("Checkout");
  fireEvent.click(chip);
  expect(onOpen).toHaveBeenCalledExactlyOnceWith("f");
  expect(onCardClick).not.toHaveBeenCalled();
});

it("shows nothing while the feature is unknown", () => {
  const { container } = render(
    <FeatureChip feature={undefined} onOpen={vi.fn()} />,
  );
  expect(container).toBeEmptyDOMElement();
});
