# Security & Sandboxing Architecture

## 1. Threat Model

An autonomous coding agent executes arbitrary code, modifies files, and invokes command-line tools. Without boundaries, an agent can:

1. Delete critical files outside the target workspace.
2. Leak sensitive credentials (e.g. `.env`, SSH keys) into logs or prompts.
3. Execute dangerous commands (e.g., `rm -rf /`, fork bombs, unauthorized network egress).

---

## 2. Core Security Controls

### Workspace Jail (Path Traversal Protection)

- Every file operation resolves relative paths against the target workspace directory root.
- All resolved paths are validated using `path.resolve()` and checked with `path.relative()` to ensure they never escape the workspace root.
- Attempts to read or write sensitive paths (e.g. `~/.ssh`, `/etc`, `~/.aws`, `.git/config`) are rejected at the tool layer.

### Human-in-the-Loop Approval Gating

- High-risk operations require explicit human approval before execution:
  - Destructive filesystem commands (`rm`, `git reset --hard`)
  - Outbound network requests
  - Dependency installations (`npm install`, `pip install`)

### Process Limits

- Commands run with strict timeout limits (default: 30s).
- Subprocess outputs are capped to prevent memory exhaustion and context-window blowup.
