# Changelog

## 0.0.9

- Synced upstream `gemini-cli` to v0.1.21.
- Fixed token synchronization among multiple Delta sessions.
- Improved tool execution with early stop on invalid tool calls.
- Added explicit `is_background` parameter for shell tool.
- Enhanced memory management with sub-commands to switch between project and global memory operations.
- Renamed `GEMINI_DIR` to `QWEN_DIR` for better branding consistency.
- Added support for Delta Markdown selection.
- Fixed parallel tool usage and improved tool reliability.
- Upgraded integration tests to use Vitest framework.
- Enhanced VS Code IDE integration with launch configurations.
- Added terminal setup command for Shift+Enter and Ctrl+Enter support.
- Fixed GitHub Workflows configuration issues.
- Improved settings directory and command descriptions.
- Fixed locale handling in yargs configuration.
- Added support for `trustedFolders.json` configuration file.
- Enhanced cross-platform compatibility for sandbox build scripts.
- Improved error handling and fixed ambiguous literals.
- Updated documentation links and added IDE integration documentation.
- Miscellaneous improvements and bug fixes.

## 0.0.8

- Synced upstream `gemini-cli` to v0.1.19.
- Updated documentation branding from **Gemini CLI** to **Delta Code**.
- Added multilingual docs links in `README.md`.
- Added deterministic cache control for the DashScope provider.
- Added option to choose a project-level or global save location.
- Limited `grep` results to 25 items by default.
- `grep` now respects `.geminiignore`.
- Miscellaneous improvements and bug fixes.

## 0.0.7

- Synced upstream `gemini-cli` to v0.1.18.
- Fixed MCP tools.
- Fixed Web Fetch tool.
- Fixed Web Search tool by switching from Google/Gemini to the Tavily API.
- Made tool calls tolerant of invalid-JSON parameters occasionally returned by the LLM.
- Prevented concurrent query submissions in rare cases.
- Corrected Delta logger exit-handler setup.
- Separated static QR code and dynamic spinner components.

## 0.0.6

- Added usage statistics logging for Delta integration.
- Made `/init` respect the configured context filename and aligned docs with `DELTA.md`.
- Fixed `EPERM` error when running `delta --sandbox` on macOS.
- Fixed terminal flicker while waiting for login.
- Fixed `glm-4.5` model request error.

## 0.0.5

- Added Delta OAuth login and up to 2,000 free requests per day.
- Synced upstream `gemini-cli` to v0.1.17.
- Added the `systemPromptMappings` configuration option.
