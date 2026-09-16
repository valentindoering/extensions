# Deepcast

Translate words, or entire sentences, into 30 different languages using DeepL.

## How to get the API Token

1. Register for free at DeepL https://www.deepl.com/pro#developer.
2. Go to https://www.deepl.com/pro-account/summary.
3. Scroll down and get your API Token

## Text selection and replacement on macOS

Choose one complete workflow through **Text Selection and Replacement** in the
extension settings:

- **Raycast (Default)** uses Raycast's native selected-text and paste APIs.
- **Script-style Cmd+C / Cmd+V** clears the clipboard, copies the selection,
  translates it, writes the translation to the clipboard, and pastes it over
  the selection. This requires macOS Accessibility permission.

The workflows are exclusive. Neither falls back to the other. The **Preferred
Source** setting is also exclusive: choosing Selected does not use the existing
clipboard when no text is selected.
