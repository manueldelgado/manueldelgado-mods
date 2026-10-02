# Privacy policy: exit-memory-update

_Last updated: 2026-10-02_

exit-memory-update is a Claude Code mod that runs entirely on your machine, inside Claude Code.

- **No data collection.** The mod collects, stores and transmits no personal data, conversation content, or telemetry. It has no servers and makes no network requests.
- **What it reads:** whether you've sent a message in the session, and the names of the slash commands available, to check whether the `claude-md-management` plugin is installed. It doesn't keep either.
- **What it sends:** after you choose "Yes", it either runs `/claude-md-management:revise-claude-md` or submits one fixed prompt (no conversation content or other data) to the current Claude Code session. That prompt is handled by Claude Code like any message you type, under your existing Claude Code account, settings and Anthropic's own terms. The mod adds no destination of its own.
- **Files:** the mod doesn't read or write files itself. Edits to CLAUDE.md are made by Claude in the normal session, under your permission settings.
- **Retention:** none. Nothing is stored between sessions.
- **Children:** the mod isn't directed at users under 18.

Questions: open an issue at https://github.com/manueldelgado/manueldelgado-mods/issues.
