# exit-memory-update

A Claude Code mod that, when you run `/exit` (or `/quit`), asks whether to update CLAUDE.md with what was learned in the session before leaving.

## Install

```
/plugin marketplace add manueldelgado/manueldelgado-mods
/plugin install exit-memory-update@manueldelgado-mods
/reload-plugins
```

## What it does

When you run `/exit`, it asks: *"Update CLAUDE.md with the learnings from this session before exiting?"*

- **Yes, update and exit**: updates CLAUDE.md (see below), then exits once that turn finishes. If the update is interrupted or fails, the session stays open and a toast tells you to run `/exit` again.
- **No, just exit**: exits right away.
- **Cancel**: stays in the session.

It doesn't ask in sessions where you haven't sent a message, or in non-interactive runs (`claude -p`, the Agent SDK).

## Hooks, commands and prompts

Full disclosure of what the mod hooks, runs and sends:

- **Hooks `/exit`** (the `command.run` event for `exit`): it holds the exit to show the question above. "No" lets the exit go through unchanged; "Cancel" stops it. It hooks no other command.
- **Hooks `turn.complete`**: only to notice when the CLAUDE.md update turn has finished. It reads nothing from the turn except whether it ended normally.
- **Runs slash commands itself**, only after you pick "Yes":
  - `/claude-md-management:revise-claude-md`, if the [CLAUDE.md Management](https://github.com/anthropics/claude-plugins-official) plugin (`claude-md-management`) is installed. It finds out by listing the session's available commands.
  - `/exit`, once the update turn finishes, to complete the exit you asked for.
- **Submits one prompt**, only after you pick "Yes" and only when `claude-md-management` is *not* installed. The prompt is fixed text and carries no conversation content or other data. It asks Claude to review the current session, read the project's CLAUDE.md (creating it if missing), add durable, non-obvious learnings (commands, conventions, architecture facts, gotchas, stated preferences) as concise, targeted edits, and summarize what changed. The full text is `FALLBACK_PROMPT` in [`hooks/register.ts`](hooks/register.ts).

The mod makes no network requests, and it doesn't read or write files itself. Any file edits are made by Claude in the normal turn, under your usual permission settings.

## Limitation

Ctrl+C, Ctrl+D and `/clear` end the session without going through `/exit`, and Claude Code gives mods only about 1.5 seconds at that point. That's too short to ask or to run an update, so use `/exit` when you want the prompt.

## License

MIT
