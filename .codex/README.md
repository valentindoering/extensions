# Codex worktrees

Select the `raycast-extensions` local environment when creating a Codex worktree.
Setup installs the lockfile dependencies and builds `extensions/deepcast` and
`extensions/stealth-ai-tool`, then runs Deepcast's mocked tests. It does not install
the rest of the upstream extension catalog, launch Raycast, publish an extension,
or request AI/translation services.

Use Node.js from `.nvmrc` or a newer supported release; the TypeScript tests require
Node.js 22.18 or newer. Node.js and npm must be on the environment's PATH.

Run `bash .codex/setup.sh` to repeat setup. The environment's **Check Deepcast** and
**Build Stealth AI** actions check the individual extensions after changes. Start
Raycast development manually from the desired extension directory when needed.
No cleanup hook is needed because setup starts no persistent processes.

For a sparse checkout, include `.codex` alongside the selected extensions:

```sh
git sparse-checkout add .codex
```
