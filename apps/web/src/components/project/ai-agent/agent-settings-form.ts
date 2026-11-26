import type { ProjectAgentSettings } from "@/fetchers/agent/get-project-agent-settings";
import type { SaveProjectAgentSettingsInput } from "@/fetchers/agent/save-project-agent-settings";

export type AgentSettingsFormValues = {
  enabled: boolean;
  autoAssess: boolean;
  repository: string;
  baseBranch: string;
  instructions: string;
  readyThreshold: string;
};

type ValidatedField = "repository" | "baseBranch" | "readyThreshold";
/** i18n keys of each invalid field's message. */
export type AgentSettingsFormErrors = Partial<Record<ValidatedField, string>>;

export const INSTRUCTIONS_MAX_LENGTH = 4000;
const NAME_MAX_LENGTH = 200;
// The API's rules: owner/name as GitHub spells it, and branch names git
// accepts that cannot be read as an option.
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PATTERN = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]+$/;

export function toAgentSettingsFormValues(
  settings: ProjectAgentSettings,
): AgentSettingsFormValues {
  return {
    enabled: settings.enabled,
    autoAssess: settings.autoAssess,
    repository: settings.repository ?? "",
    baseBranch: settings.baseBranch,
    instructions: settings.instructions,
    readyThreshold: String(settings.readyThreshold),
  };
}

function parseThreshold(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const threshold = Number(trimmed);
  return threshold >= 1 && threshold <= 100 ? threshold : null;
}

export function validateAgentSettings(
  values: AgentSettingsFormValues,
): AgentSettingsFormErrors {
  const errors: AgentSettingsFormErrors = {};
  const repository = values.repository.trim();
  const baseBranch = values.baseBranch.trim();
  if (
    repository &&
    (repository.length > NAME_MAX_LENGTH ||
      !REPOSITORY_PATTERN.test(repository))
  )
    errors.repository = "settings:aiAgentPage.project.errors.repository";
  if (
    !baseBranch ||
    baseBranch.length > NAME_MAX_LENGTH ||
    !BRANCH_PATTERN.test(baseBranch)
  )
    errors.baseBranch = "settings:aiAgentPage.project.errors.baseBranch";
  if (parseThreshold(values.readyThreshold) === null)
    errors.readyThreshold =
      "settings:aiAgentPage.project.errors.readyThreshold";
  return errors;
}

/** The request body; call only with values that passed validation. */
export function toAgentSettingsInput(
  values: AgentSettingsFormValues,
): SaveProjectAgentSettingsInput {
  return {
    enabled: values.enabled,
    autoAssess: values.autoAssess,
    // Empty falls back to the GitHub integration's repository.
    repository: values.repository.trim() || null,
    baseBranch: values.baseBranch.trim(),
    instructions: values.instructions.slice(0, INSTRUCTIONS_MAX_LENGTH),
    readyThreshold: parseThreshold(values.readyThreshold) ?? 80,
  };
}
