# Shell Tool (`run_shell_command`)

This document describes the `run_shell_command` tool for Delta Code.

## Description

Use `run_shell_command` to interact with the underlying system, run scripts, or perform command-line operations. `run_shell_command` executes a given shell command. On Windows, the command will be executed with `cmd.exe /c`. On other platforms, the command will be executed with `bash -c`.

### Arguments

`run_shell_command` takes the following arguments:

- `command` (string, required): The exact shell command to execute.
- `description` (string, optional): A brief description of the command's purpose, which will be shown to the user.
- `directory` (string, optional): The directory (relative to the project root) in which to execute the command. If not provided, the command runs in the project root.
- `is_background` (boolean, required): Whether to run the command in background. This parameter is required to ensure explicit decision-making about command execution mode. Set to true for long-running processes like development servers, watchers, or daemons that should continue running without blocking further commands. Set to false for one-time commands that should complete before proceeding.

## How to use `run_shell_command` with Delta Code

When using `run_shell_command`, the command is executed as a subprocess. You can control whether commands run in background or foreground using the `is_background` parameter, or by explicitly adding `&` to commands. The tool returns detailed information about the execution, including:

### Required Background Parameter

The `is_background` parameter is **required** for all command executions. This design ensures that the LLM (and users) must explicitly decide whether each command should run in the background or foreground, promoting intentional and predictable command execution behavior. By making this parameter mandatory, we avoid unintended fallback to foreground execution, which could block subsequent operations when dealing with long-running processes.

### Background vs Foreground Execution

The tool intelligently handles background and foreground execution based on your explicit choice:

**Use background execution (`is_background: true`) for:**

- Long-running development servers: `npm run start`, `npm run dev`, `yarn dev`
- Build watchers: `npm run watch`, `webpack --watch`
- Database servers: `mongod`, `mysql`, `redis-server`
- Web servers: `python -m http.server`, `php -S localhost:8000`
- Any command expected to run indefinitely until manually stopped

**Use foreground execution (`is_background: false`) for:**

- One-time commands: `ls`, `cat`, `grep`
- Build commands: `npm run build`, `make`
- Installation commands: `npm install`, `pip install`
- Git operations: `git commit`, `git push`
- Test runs: `npm test`, `pytest`

### Execution Information

The tool returns detailed information about the execution, including:

- `Command`: The command that was executed.
- `Directory`: The directory where the command was run.
- `Stdout`: Output from the standard output stream.
- `Stderr`: Output from the standard error stream.
- `Error`: Any error message reported by the subprocess.
- `Exit Code`: The exit code of the command.
- `Signal`: The signal number if the command was terminated by a signal.
- `Background PIDs`: A list of PIDs for any background processes started.

Usage:

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Note:** The `is_background` parameter is required and must be explicitly specified for every command execution.

## `run_shell_command` examples

List files in the current directory:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Run a script in a specific directory:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

Start a background development server (recommended approach):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Start a background server (alternative with explicit &):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Run a build command in foreground:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Start multiple background services:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Important notes

- **Security:** Be cautious when executing commands, especially those constructed from user input, to prevent security vulnerabilities.
- **Interactive commands:** Avoid commands that require interactive user input, as this can cause the tool to hang. Use non-interactive flags if available (e.g., `npm init -y`).
- **Error handling:** Check the `Stderr`, `Error`, and `Exit Code` fields to determine if a command executed successfully.
- **Background processes:** When `is_background=true` or when a command contains `&`, the tool will return immediately and the process will continue to run in the background. The `Background PIDs` field will contain the process ID of the background process.
- **Background execution choices:** The `is_background` parameter is required and provides explicit control over execution mode. You can also add `&` to the command for manual background execution, but the `is_background` parameter must still be specified. The parameter provides clearer intent and automatically handles the background execution setup.
- **Command descriptions:** When using `is_background=true`, the command description will include a `[background]` indicator to clearly show the execution mode.

## Environment Variables

When `run_shell_command` executes a command, it sets the `QWEN_CODE=1` environment variable in the subprocess's environment. This allows scripts or tools to detect if they are being run from within the CLI.

## Command Restrictions

You can restrict the commands that can be executed by the `run_shell_command` tool by using the `coreTools` and `excludeTools` settings in your configuration file.

- `coreTools`: To restrict `run_shell_command` to a specific set of commands, add entries to the `coreTools` list in the format `run_shell_command(<command>)`. For example, `"coreTools": ["run_shell_command(git)"]` will only allow `git` commands. Including the generic `run_shell_command` acts as a wildcard, allowing any command not explicitly blocked.
- `excludeTools`: To block specific commands, add entries to the `excludeTools` list in the format `run_shell_command(<command>)`. For example, `"excludeTools": ["run_shell_command(rm)"]` will block `rm` commands.

The validation logic is designed to be secure and flexible:

1.  **Command Chaining Disabled**: The tool automatically splits commands chained with `&&`, `||`, or `;` and validates each part separately. If any part of the chain is disallowed, the entire command is blocked.
2.  **Prefix Matching**: The tool uses prefix matching. For example, if you allow `git`, you can run `git status` or `git log`.
3.  **Blocklist Precedence**: The `excludeTools` list is always checked first. If a command matches a blocked prefix, it will be denied, even if it also matches an allowed prefix in `coreTools`.

### Command Restriction Examples

**Allow only specific command prefixes**

To allow only `git` and `npm` commands, and block all others:

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status`: Allowed
- `npm install`: Allowed
- `ls -l`: Blocked

**Block specific command prefixes**

To block `rm` and allow all other commands:

```json
{
  "coreTools": ["run_shell_command"],
  "excludeTools": ["run_shell_command(rm)"]
}
```

- `rm -rf /`: Blocked
- `git status`: Allowed
- `npm install`: Allowed

**Blocklist takes precedence**

If a command prefix is in both `coreTools` and `excludeTools`, it will be blocked.

```json
{
  "coreTools": ["run_shell_command(git)"],
  "excludeTools": ["run_shell_command(git push)"]
}
```

- `git push origin main`: Blocked
- `git status`: Allowed

**Block all shell commands**

To block all shell commands, add the `run_shell_command` wildcard to `excludeTools`:

```json
{
  "excludeTools": ["run_shell_command"]
}
```

- `ls -l`: Blocked
- `any other command`: Blocked

## Security Note for `excludeTools`

Command-specific restrictions in `excludeTools` for `run_shell_command` are based on simple string matching and can be easily bypassed. This feature is **not a security mechanism** and should not be relied upon to safely execute untrusted code. It is recommended to use `coreTools` to explicitly select commands
that can be executed.
