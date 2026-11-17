import { describe, expect, it } from "vite-plus/test";
import { holidayLanguage } from "./holiday-language";

describe("holidayLanguage", () => {
  it("keeps the lowercased base subtag", () => {
    expect(holidayLanguage("de")).toBe("de");
    expect(holidayLanguage("pt-BR")).toBe("pt");
    expect(holidayLanguage("zh_TW")).toBe("zh");
    expect(holidayLanguage(" FR ")).toBe("fr");
  });

  it("maps the dataset's non-ISO language codes", () => {
    expect(holidayLanguage("ja-JP")).toBe("jp");
    expect(holidayLanguage("cs")).toBe("cz");
    expect(holidayLanguage("ka")).toBe("ge");
  });

  it("falls back to English", () => {
    expect(holidayLanguage()).toBe("en");
    expect(holidayLanguage("")).toBe("en");
    expect(holidayLanguage("1x")).toBe("en");
    expect(holidayLanguage("constructor")).toBe("en");
  });
});
