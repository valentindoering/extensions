# Deepcast

Translate words, or entire sentences, into 30 different languages using DeepL.

## How to get the API Token

1. Register for free at DeepL https://www.deepl.com/pro#developer.
2. Go to https://www.deepl.com/pro-account/summary.
3. Scroll down and get your API Token

## Selected text compatibility on macOS

Deepcast can read selected text in three ways through **Selected Text Method**
in the extension settings:

- **Raycast Only** uses Raycast's native selected-text API.
- **Raycast, then Cmd+C** uses the native API first and the compatibility method
  only when needed.
- **Cmd+C, then Raycast** uses the compatibility method first and falls back to
  the native API.

The `Cmd+C` method preserves the previous clipboard and can retain rich text
when the selected application provides it. It requires macOS Accessibility
permission.
