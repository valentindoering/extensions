import { Application, getFrontmostApplication, getSelectedText } from "@raycast/api";
import { execFileSync } from "child_process";
import { runTextWorkflow, TextWorkflow } from "./text-workflow";

export type SelectionMethod = TextWorkflow;

export interface SelectedContent {
  text: string;
  html?: string;
}

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

async function getViaRaycast(): Promise<SelectedContent> {
  try {
    return { text: await getSelectedText() };
  } catch (error) {
    console.log(`Raycast selected-text API failed: ${error}`);
    return { text: "" };
  }
}

async function getViaScript(targetApplication?: Application): Promise<SelectedContent> {
  if (process.platform !== "darwin") return { text: "" };

  try {
    writeClipboardText("");
    runAppleScript(ACTIVATE_AND_COPY_SCRIPT, [targetApplication?.bundleId ?? ""]);
    return { text: readClipboardText() };
  } catch (error) {
    console.log(`Script selected-text workflow failed: ${error}`);
    return { text: "" };
  }
}

export async function getTargetApplication(): Promise<Application | undefined> {
  if (process.platform !== "darwin") return undefined;

  try {
    return await getFrontmostApplication();
  } catch (error) {
    console.log(`Could not determine the frontmost application: ${error}`);
    return undefined;
  }
}

export async function getSelectedContent(
  method: SelectionMethod,
  targetApplication?: Application,
): Promise<SelectedContent> {
  return runTextWorkflow(method, {
    raycast: getViaRaycast,
    script: () => getViaScript(targetApplication),
  });
}

export async function replaceSelectedTextViaScript(text: string, targetApplication?: Application): Promise<void> {
  writeClipboardText(text);
  runAppleScript(ACTIVATE_AND_PASTE_SCRIPT, [targetApplication?.bundleId ?? ""]);
}
