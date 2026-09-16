import {
  AI,
  Clipboard,
  environment,
  getFrontmostApplication,
  getPreferenceValues,
  getSelectedText,
  launchCommand,
  LaunchType,
  showToast,
  Toast,
} from "@raycast/api";

import { getActionConfig } from "./action-config";
import { LLMConfigError, LLMService } from "./llm-service";
import { activateApplication, getSelectedTextViaClipboard } from "./selection";

interface ActionPreferences {
  title?: string;
  prompt?: string;
  useClipboardSelectionFallback?: boolean;
}

// In-memory lock to prevent concurrent executions
let isRunning = false;
// Debounce is tracked per action so a hotkey double-fire is swallowed without
// one action blocking a different one.
const lastRunTimes = new Map<string, number>();
const DEBOUNCE_MS = 3000;

export async function runStealthAction(actionId: string) {
  const now = Date.now();
  console.log(`--- Starting runStealthAction: ${actionId} at ${now} ---`);

  // Concurrency lock with time-based debounce
  if (isRunning) {
    console.log("[LOCKED] Action already running. Aborting.");
    return;
  }

  // Debounce: don't re-run the same action within the debounce window
  const lastRun = lastRunTimes.get(actionId) ?? 0;
  if (now - lastRun < DEBOUNCE_MS) {
    console.log(
      `[DEBOUNCE] ${actionId} last ran ${now - lastRun}ms ago. Aborting.`,
    );
    return;
  }

  isRunning = true;
  lastRunTimes.set(actionId, now);

  try {
    await runStealthActionInternal(actionId);
  } finally {
    isRunning = false;
    console.log(`--- Finished runStealthAction: ${actionId} ---`);
  }
}

/** Surfaces a configuration problem with a one-press route to the fix. */
async function showModelErrorToast(errorMsg: string) {
  const toast = await showToast({
    style: Toast.Style.Failure,
    title: "AI Not Configured",
    message: errorMsg,
  });
  toast.primaryAction = {
    title: "Configure AI Model",
    onAction: () => {
      launchCommand({
        name: "configure-model",
        type: LaunchType.UserInitiated,
      });
    },
  };
  return toast;
}

async function runStealthActionInternal(actionId: string) {
  // 1. Load config
  const prefs = getPreferenceValues<ActionPreferences>();
  const currentConfig = await getActionConfig(actionId, prefs);
  console.log(`Config: ${currentConfig.title}`);

  const isMac = process.platform === "darwin";
  const targetApplication = isMac
    ? await getFrontmostApplication().catch((error) => {
        console.log(`[DEBUG] Could not get frontmost app: ${error}`);
        return undefined;
      })
    : undefined;

  // 2. AI Access Debug (for troubleshooting "Model not supported")
  let canAccessAI = false;
  try {
    canAccessAI = environment.canAccess(AI);
    console.log(`[DEBUG] environment.canAccess(AI): ${canAccessAI}`);
  } catch (e) {
    console.log(`[DEBUG] environment.canAccess(AI) failed with error: ${e}`);
  }

  // 3. Get selected text using Raycast's native cross-platform API
  let selectedText = "";
  let hasRealSelection = false;

  try {
    console.log("[DEBUG] Using Raycast getSelectedText API...");
    selectedText = await getSelectedText();
    hasRealSelection = selectedText.trim().length > 0;
  } catch (e) {
    console.log(`[DEBUG] getSelectedText failed (no selection): ${e}`);
  }

  if (!hasRealSelection && isMac && prefs.useClipboardSelectionFallback) {
    try {
      console.log("[DEBUG] Trying opt-in clipboard selection fallback...");
      selectedText = await getSelectedTextViaClipboard(targetApplication);
      hasRealSelection = selectedText.trim().length > 0;
    } catch (error) {
      console.log(`[DEBUG] Clipboard selection fallback failed: ${error}`);
    }
  }

  if (!hasRealSelection || !selectedText || selectedText.trim().length === 0) {
    const toast = await showToast({
      style: Toast.Style.Failure,
      title: "No text selected",
      message: "Please select text first",
    });
    toast.primaryAction = {
      title: "Configure AI Model",
      onAction: () => {
        launchCommand({
          name: "configure-model",
          type: LaunchType.UserInitiated,
        });
      },
    };
    return;
  }

  // 4. Show processing toast
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: `${currentConfig.title}...`,
  });

  try {
    // 5. Final AI access check
    const currentProvider = await LLMService.getProvider();
    if (!canAccessAI && currentProvider === "raycast") {
      throw new LLMConfigError(
        "Raycast AI is required. Upgrade to Raycast Pro, or pick another provider.",
      );
    }

    // 6. Call AI (using new LLM Service)
    const prompt = `${currentConfig.prompt}\n\n${selectedText}`;
    console.log(`Calling AI via ${currentProvider}...`);

    let result = "";
    try {
      result = await LLMService.askAI(prompt);
      console.log(`AI result: "${result?.substring(0, 50)}..."`);
    } catch (e) {
      console.error(`AI Service failed: ${e}`);

      const errorMsg = (e as Error).message;

      // Misconfiguration (missing key/model, unreachable local server) gets a
      // toast that links straight to the configuration command.
      if (e instanceof LLMConfigError) {
        await showModelErrorToast(errorMsg);
        return;
      }

      // Clipboard Fallback
      console.log("[DEBUG] AI Service failed. Using Clipboard Fallback.");
      await Clipboard.copy(prompt);

      await showToast({
        style: Toast.Style.Failure,
        title: "AI Call Failed",
        message: "Prompt copied! Paste in external AI tool.",
      });
      return;
    }

    if (!result) throw new Error("Empty AI response");

    const cleanResult = result.trim();

    // 7. Insert text (for successful calls)
    toast.title = "Inserting...";
    console.log(`Pasting ${cleanResult.length} chars to replace selection`);

    if (isMac) {
      try {
        await activateApplication(targetApplication);
      } catch (error) {
        console.log(`[DEBUG] Could not reactivate target app: ${error}`);
      }
    }

    await Clipboard.paste(cleanResult);
    toast.style = Toast.Style.Success;
    toast.title = "Done!";
  } catch (error) {
    console.error("Error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (error instanceof LLMConfigError) {
      await showModelErrorToast(errorMsg);
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed";
      toast.message = errorMsg;
    }
  }
}
