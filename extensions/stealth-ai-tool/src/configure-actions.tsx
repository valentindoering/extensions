import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  ACTION_IDS,
  ActionConfig,
  ActionConfigs,
  DEFAULT_CONFIGS,
  getStoredActionConfigs,
  saveActionConfig,
} from "./utils/action-config";

function EditActionForm({
  actionId,
  config,
  onSave,
}: {
  actionId: string;
  config: ActionConfig;
  onSave: (config: ActionConfig) => void;
}) {
  const { pop } = useNavigation();

  async function handleSubmit(values: ActionConfig) {
    const next = {
      title: values.title.trim() || DEFAULT_CONFIGS[actionId].title,
      prompt: values.prompt,
    };
    await saveActionConfig(actionId, next);
    onSave(next);
    await showToast({
      style: Toast.Style.Success,
      title: "Action Saved",
      message: next.title,
    });
    pop();
  }

  return (
    <Form
      navigationTitle={`Configure ${actionId.replace("action-", "Action ")}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Action" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Action Title"
        defaultValue={config.title}
      />
      <Form.TextArea
        id="prompt"
        title="AI Prompt"
        defaultValue={config.prompt}
        autoFocus
        info="The selected text is appended after this prompt when the action runs."
      />
    </Form>
  );
}

export default function ConfigureActionsCommand() {
  const [configs, setConfigs] = useState<ActionConfigs>(DEFAULT_CONFIGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getStoredActionConfigs();
      const merged = Object.fromEntries(
        ACTION_IDS.map((actionId) => [
          actionId,
          { ...DEFAULT_CONFIGS[actionId], ...stored[actionId] },
        ]),
      ) as ActionConfigs;
      setConfigs(merged);
      setIsLoading(false);
    })();
  }, []);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Choose an action to configure"
    >
      {ACTION_IDS.map((actionId, index) => {
        const config = configs[actionId];
        return (
          <List.Item
            key={actionId}
            icon={Icon.Wand}
            title={config.title}
            subtitle={`Stealth Action ${index + 1}`}
            accessories={[
              { text: config.prompt ? "Custom prompt" : "No prompt" },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Edit Action"
                  icon={Icon.Pencil}
                  target={
                    <EditActionForm
                      actionId={actionId}
                      config={config}
                      onSave={(next) =>
                        setConfigs((current) => ({
                          ...current,
                          [actionId]: next,
                        }))
                      }
                    />
                  }
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
