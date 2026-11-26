import { describe, expect, it } from "vite-plus/test";
import {
  type AgentSettingsFormValues,
  toAgentSettingsFormValues,
  toAgentSettingsInput,
  validateAgentSettings,
} from "./agent-settings-form";

const values: AgentSettingsFormValues = {
  enabled: true,
  autoAssess: false,
  repository: "acme/web",
  baseBranch: "main",
  instructions: "Run pnpm test before opening a pull request.",
  readyThreshold: "75",
};

describe("toAgentSettingsFormValues", () => {
  it("shows an unset repository as an empty field", () => {
    expect(
      toAgentSettingsFormValues({
        enabled: false,
        autoAssess: true,
        repository: null,
        suggestedRepository: "acme/api",
        baseBranch: "main",
        instructions: "",
        readyThreshold: 80,
        runnerConfigured: false,
      }),
    ).toEqual({
      enabled: false,
      autoAssess: true,
      repository: "",
      baseBranch: "main",
      instructions: "",
      readyThreshold: "80",
    });
  });
});

describe("validateAgentSettings", () => {
  it("accepts valid settings and an empty repository", () => {
    expect(validateAgentSettings(values)).toEqual({});
    expect(validateAgentSettings({ ...values, repository: "  " })).toEqual({});
  });

  it("rejects a repository that is not owner/name", () => {
    expect(
      validateAgentSettings({ ...values, repository: "acme" }).repository,
    ).toBe("settings:aiAgentPage.project.errors.repository");
    expect(
      validateAgentSettings({ ...values, repository: "https://github.com/a/b" })
        .repository,
    ).toBeDefined();
  });

  it("rejects branch names git would refuse or read as an option", () => {
    for (const baseBranch of ["", "-main", "a..b", "feature branch"])
      expect(validateAgentSettings({ ...values, baseBranch }).baseBranch).toBe(
        "settings:aiAgentPage.project.errors.baseBranch",
      );
    expect(
      validateAgentSettings({ ...values, baseBranch: "release/2.0" }),
    ).toEqual({});
  });

  it("needs a whole threshold from 1 to 100", () => {
    for (const readyThreshold of ["0", "101", "7.5", "", "abc"])
      expect(
        validateAgentSettings({ ...values, readyThreshold }).readyThreshold,
      ).toBe("settings:aiAgentPage.project.errors.readyThreshold");
    expect(validateAgentSettings({ ...values, readyThreshold: "100" })).toEqual(
      {},
    );
  });
});

describe("toAgentSettingsInput", () => {
  it("trims names, parses the threshold and saves a blank repository as unset", () => {
    expect(
      toAgentSettingsInput({
        ...values,
        repository: " ",
        baseBranch: " develop ",
        readyThreshold: " 60 ",
      }),
    ).toEqual({
      enabled: true,
      autoAssess: false,
      repository: null,
      baseBranch: "develop",
      instructions: values.instructions,
      readyThreshold: 60,
    });
  });
});
