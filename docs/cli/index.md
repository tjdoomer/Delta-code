# Delta Code CLI

Within Delta Code, `packages/cli` is the frontend for users to send and receive prompts with Delta and other AI models and their associated tools. For a general overview of Delta Code, see the [main documentation page](../index.md).

## Navigating this section

- **[Authentication](./authentication.md):** A guide to setting up authentication with Delta OAuth and OpenAI-compatible providers.
- **[Commands](./commands.md):** A reference for Delta Code CLI commands (e.g., `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** A guide to tailoring Delta Code CLI behavior using configuration files.
- **[Token Caching](./token-caching.md):** Optimize API costs through token caching.
- **[Themes](./themes.md)**: A guide to customizing the CLI's appearance with different themes.
- **[Tutorials](tutorials.md)**: A tutorial showing how to use Delta Code to automate a development task.

## Non-interactive mode

Delta Code can be run in a non-interactive mode, which is useful for scripting and automation. In this mode, you pipe input to the CLI, it executes the command, and then it exits.

The following example pipes a command to Delta Code from your terminal:

```bash
echo "What is fine tuning?" | delta
```

Delta Code executes the command and prints the output to your terminal. Note that you can achieve the same behavior by using the `--prompt` or `-p` flag. For example:

```bash
delta -p "What is fine tuning?"
```
