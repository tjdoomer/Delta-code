# Ignoring Files

This document provides an overview of the Delta Ignore (`.deltaignore`) feature of Delta Code.

Delta Code includes the ability to automatically ignore files, similar to `.gitignore` (used by Git) and `.aiexclude` (used by Gemini Code Assist). Adding paths to your `.deltaignore` file will exclude them from tools that support this feature, although they will still be visible to other services (such as Git).

## How it works

When you add a path to your `.deltaignore` file, tools that respect this file will exclude matching files and directories from their operations. For example, when you use the [`read_many_files`](./tools/multi-file.md) command, any paths in your `.deltaignore` file will be automatically excluded.

For the most part, `.deltaignore` follows the conventions of `.gitignore` files:

- Blank lines and lines starting with `#` are ignored.
- Standard glob patterns are supported (such as `*`, `?`, and `[]`).
- Putting a `/` at the end will only match directories.
- Putting a `/` at the beginning anchors the path relative to the `.deltaignore` file.
- `!` negates a pattern.

You can update your `.deltaignore` file at any time. To apply the changes, you must restart your Delta Code session.

## How to use `.deltaignore`

To enable `.deltaignore`:

1. Create a file named `.deltaignore` in the root of your project directory.

To add a file or directory to `.deltaignore`:

1. Open your `.deltaignore` file.
2. Add the path or file you want to ignore, for example: `/archive/` or `apikeys.txt`.

### `.deltaignore` examples

You can use `.deltaignore` to ignore directories and files:

```
# Exclude your /packages/ directory and all subdirectories
/packages/

# Exclude your apikeys.txt file
apikeys.txt
```

You can use wildcards in your `.deltaignore` file with `*`:

```
# Exclude all .md files
*.md
```

Finally, you can exclude files and directories from exclusion with `!`:

```
# Exclude all .md files except README.md
*.md
!README.md
```

To remove paths from your `.deltaignore` file, delete the relevant lines.
