import { LocalStorage } from "@raycast/api";

export interface ActionConfig {
  title: string;
  prompt: string;
}

export type ActionConfigs = Record<string, ActionConfig>;

export const ACTION_CONFIGS_STORAGE_KEY = "action-configs";

export const ACTION_IDS = [
  "action-1",
  "action-2",
  "action-3",
  "action-4",
  "action-5",
  "action-6",
  "action-7",
  "action-8",
  "action-9",
] as const;

export const DEFAULT_CONFIGS: ActionConfigs = {
  "action-1": {
    title: "Fix Grammar",
    prompt:
      "Fix all typos, spelling errors, and grammar issues in the following text. IMPORTANT: Do NOT change the capitalization of the first character - if it starts with a lowercase letter, keep it lowercase. Return only the corrected text without any explanation:",
  },
  "action-2": {
    title: "Make Concise",
    prompt:
      "Make the following text more concise while preserving the key meaning. Return only the rewritten text without explanation:",
  },
  "action-3": {
    title: "Create List",
    prompt:
      "Convert the following text into a clean bullet point list. Return only the list without explanation:",
  },
  "action-4": {
    title: "Make Professional",
    prompt:
      "Rewrite the following text to be more professional and polished, suitable for business communication. Return only the rewritten text without explanation:",
  },
  "action-5": {
    title: "Simplify",
    prompt:
      "Simplify the following text to make it easier to understand. Use simpler words and shorter sentences. Return only the simplified text without explanation:",
  },
  "action-6": { title: "Action 6", prompt: "" },
  "action-7": { title: "Action 7", prompt: "" },
  "action-8": { title: "Action 8", prompt: "" },
  "action-9": { title: "Action 9", prompt: "" },
};

export async function getStoredActionConfigs(): Promise<
  Partial<ActionConfigs>
> {
  const saved = await LocalStorage.getItem<string>(ACTION_CONFIGS_STORAGE_KEY);
  if (!saved) return {};

  try {
    return JSON.parse(saved) as Partial<ActionConfigs>;
  } catch (error) {
    console.error("Failed to parse saved action configs", error);
    return {};
  }
}

export async function getActionConfig(
  actionId: string,
  preferences: Partial<ActionConfig> = {},
): Promise<ActionConfig> {
  const defaults = DEFAULT_CONFIGS[actionId] ?? {
    title: actionId,
    prompt: "",
  };
  const stored: Partial<ActionConfig> =
    (await getStoredActionConfigs())[actionId] ?? {};

  return {
    title: stored.title || preferences.title || defaults.title,
    prompt: stored.prompt ?? preferences.prompt ?? defaults.prompt,
  };
}

export async function saveActionConfig(
  actionId: string,
  config: ActionConfig,
): Promise<void> {
  const configs = await getStoredActionConfigs();
  configs[actionId] = config;
  await LocalStorage.setItem(
    ACTION_CONFIGS_STORAGE_KEY,
    JSON.stringify(configs),
  );
}
