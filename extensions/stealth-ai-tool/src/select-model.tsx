import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  openExtensionPreferences,
  popToRoot,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { LLMService, Model, requiresApiKey } from "./utils/llm-service";

interface ManualModelValues {
  modelId: string;
}

function ManualModelForm({
  provider,
  currentModel,
  onSave,
}: {
  provider: string;
  currentModel: string;
  onSave: (modelId: string) => Promise<void>;
}) {
  const { pop } = useNavigation();

  async function handleSubmit(values: ManualModelValues) {
    const modelId = values.modelId.trim();
    if (!modelId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Model ID Required",
      });
      return;
    }

    await onSave(modelId);
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Use Model" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        text={`Enter the exact model ID accepted by ${provider}. Use this when a new or private model is missing from the fetched list.`}
      />
      <Form.TextField
        id="modelId"
        title="Model ID"
        defaultValue={currentModel}
        placeholder="Provider model ID"
        autoFocus
      />
    </Form>
  );
}

export default function SelectModelCommand() {
  const [provider, setProvider] = useState("");
  const [currentModel, setCurrentModel] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const saveModel = useCallback(
    async (modelId: string) => {
      await LLMService.setSelectedModel(provider, modelId);
      setCurrentModel(modelId);
      await showToast({
        style: Toast.Style.Success,
        title: "Model Selected",
        message: `${provider}: ${modelId}`,
      });
    },
    [provider],
  );

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const activeProvider = await LLMService.getProvider();
      setProvider(activeProvider);

      if (activeProvider === "raycast") {
        setModels([]);
        setCurrentModel("");
        return;
      }

      const [apiKey, baseUrl, selectedModel] = await Promise.all([
        LLMService.getApiKey(),
        LLMService.getBaseUrl(activeProvider),
        LLMService.getSelectedModel(activeProvider),
      ]);
      setCurrentModel(selectedModel);

      if (requiresApiKey(activeProvider) && !apiKey) {
        setModels([]);
        setError(
          `Add the ${activeProvider} API key in the extension settings first.`,
        );
        return;
      }

      const fetched = await LLMService.fetchModels(
        activeProvider,
        apiKey,
        baseUrl,
      );
      setModels(fetched);
      if (fetched.length === 0) {
        setError("The provider returned no models.");
      }
    } catch (caught) {
      setModels([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  async function selectModel(modelId: string) {
    await saveModel(modelId);
    await popToRoot();
  }

  const manualModelAction = provider && provider !== "raycast" && (
    <Action.Push
      title="Enter Model Id Manually"
      icon={Icon.Pencil}
      shortcut={{ modifiers: ["cmd"], key: "m" }}
      target={
        <ManualModelForm
          provider={provider}
          currentModel={currentModel}
          onSave={saveModel}
        />
      }
    />
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={
        provider ? `Search ${provider} models` : "Loading provider"
      }
    >
      {!isLoading && provider === "raycast" && (
        <List.EmptyView
          icon={Icon.Stars}
          title="Raycast AI Selects the Model"
          description="Choose the Raycast AI model in Raycast Settings > AI, or choose another provider in the Stealth AI extension settings."
          actions={
            <ActionPanel>
              <Action
                title="Open Extension Settings"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      )}

      {!isLoading && provider !== "raycast" && models.length === 0 && (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Models Could Not Be Loaded"
          description={error}
          actions={
            <ActionPanel>
              <Action
                title="Open Extension Settings"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
              <Action
                title="Refresh Models"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={loadModels}
              />
              {manualModelAction}
            </ActionPanel>
          }
        />
      )}

      {models.map((model) => (
        <List.Item
          key={model.id}
          icon={model.id === currentModel ? Icon.CheckCircle : Icon.Circle}
          title={model.name}
          subtitle={model.id === model.name ? model.description : model.id}
          accessories={
            model.id === currentModel ? [{ text: "Current" }] : undefined
          }
          actions={
            <ActionPanel>
              <Action
                title="Use Model"
                icon={Icon.CheckCircle}
                onAction={() => selectModel(model.id)}
              />
              <Action
                title="Refresh Models"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={loadModels}
              />
              {manualModelAction}
              <Action
                title="Open Extension Settings"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
