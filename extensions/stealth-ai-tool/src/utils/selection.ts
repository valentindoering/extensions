import { Application, Clipboard, getSelectedText } from "@raycast/api";
import { execFileSync } from "child_process";
import { runTextWorkflow, TextWorkflow } from "./text-workflow";

export type SelectionMethod = TextWorkflow;

const UTF8_ENVIRONMENT = {
  ...process.env,
  LANG: "en_US.UTF-8",
  LC_ALL: "en_US.UTF-8",
};

const ACTIVATE_AND_COPY_SCRIPT = `
on run argv
  set targetBundleId to item 1 of argv
  tell application "System Events"
    if targetBundleId is not "" then
      set frontmost of first application process whose bundle identifier is targetBundleId to true
    end if
    delay 0.1
    keystroke "c" using command down
    delay 0.3
  end tell
end run
`;

const ACTIVATE_SCRIPT = `
on run argv
  set targetBundleId to item 1 of argv
  if targetBundleId is "" then return
  tell application "System Events"
    set frontmost of first application process whose bundle identifier is targetBundleId to true
  end tell
end run
`;

const ACTIVATE_AND_PASTE_SCRIPT = `
on run argv
  set targetBundleId to item 1 of argv
  tell application "System Events"
    if targetBundleId is not "" then
      set frontmost of first application process whose bundle identifier is targetBundleId to true
    end if
    delay 0.1
    keystroke "v" using command down
  end tell
end run
`;

function runAppleScript(script: string, args: string[] = []): void {
  execFileSync("/usr/bin/osascript", ["-e", script, ...args], {
    timeout: 5_000,
  });
}

function writeClipboardText(text: string): void {
  execFileSync("/usr/bin/pbcopy", [], {
    input: text,
    encoding: "utf8",
    env: UTF8_ENVIRONMENT,
  });
}

function readClipboardText(): string {
  return execFileSync("/usr/bin/pbpaste", ["-Prefer", "txt"], {
    encoding: "utf8",
    env: UTF8_ENVIRONMENT,
  });
}

async function getSelectedTextViaRaycast(): Promise<string> {
  try {
    return await getSelectedText();
  } catch (error) {
    console.log(`[DEBUG] Raycast selected-text API failed: ${error}`);
    return "";
  }
}

async function getSelectedTextViaScript(
  targetApplication?: Application,
): Promise<string> {
  if (process.platform !== "darwin") return "";

  try {
    writeClipboardText("");
    runAppleScript(ACTIVATE_AND_COPY_SCRIPT, [
      targetApplication?.bundleId ?? "",
    ]);
    return readClipboardText();
  } catch (error) {
    console.log(`[DEBUG] Script selected-text workflow failed: ${error}`);
    return "";
  }
}

export async function getSelectedTextWithMethod(
  method: SelectionMethod,
  targetApplication?: Application,
): Promise<string> {
  return runTextWorkflow(method, {
    raycast: getSelectedTextViaRaycast,
    script: () => getSelectedTextViaScript(targetApplication),
  });
}

export async function activateApplication(
  application?: Application,
): Promise<void> {
  if (!application?.bundleId) return;
  runAppleScript(ACTIVATE_SCRIPT, [application.bundleId]);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

export async function replaceSelectedTextWithMethod(
  method: SelectionMethod,
  text: string,
  targetApplication?: Application,
): Promise<void> {
  await runTextWorkflow(method, {
    raycast: async () => {
      await activateApplication(targetApplication);
      await Clipboard.paste(text);
    },
    script: async () => {
      writeClipboardText(text);
      runAppleScript(ACTIVATE_AND_PASTE_SCRIPT, [
        targetApplication?.bundleId ?? "",
      ]);
    },
  });
}
