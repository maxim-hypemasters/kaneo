import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { focusIsFree } from "./focus-is-free";

let container: HTMLDivElement;
let inside: HTMLButtonElement;
let outside: HTMLInputElement;

beforeEach(() => {
  container = document.createElement("div");
  inside = document.createElement("button");
  outside = document.createElement("input");
  container.append(inside);
  document.body.append(container, outside);
});
afterEach(() => {
  container.remove();
  outside.remove();
});

it("is free when nothing has focus", () => {
  expect(focusIsFree(container)).toBe(true);
  expect(focusIsFree(null)).toBe(true);
});

it("is free when focus is already inside the container", () => {
  inside.focus();

  expect(focusIsFree(container)).toBe(true);
});

it("is taken when someone is using something outside the container", () => {
  outside.focus();

  expect(focusIsFree(container)).toBe(false);
  expect(focusIsFree(null)).toBe(false);
});
