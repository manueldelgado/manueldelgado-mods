import type { Register } from 'claude-code'

const PLUGIN = 'claude-md-management'
const SKILL = 'revise-claude-md'

const YES = 'Yes, update and exit'
const NO = 'No, just exit'
const CANCEL = 'Cancel'

const FALLBACK_PROMPT = `The session is about to end. Before it does, update CLAUDE.md with the learnings from this session.

1. Review this conversation for durable, non-obvious knowledge a future session would need: commands that work (build, test, lint, run), project conventions, architecture facts, gotchas and pitfalls hit, preferences the user stated.
2. Read the existing CLAUDE.md in the project root (create it if it does not exist). Skip anything it already says, anything derivable from the code itself, and anything that only mattered to this conversation.
3. Make concise, targeted edits under the fitting sections; don't rewrite unrelated content.
4. Finish with a short summary of what you added or changed, or say that there was nothing worth recording.`

export const register: Register = on => {
  // Set while the update turn runs; when it finishes we run /exit for real.
  let isExitPending = false

  on('command.run', { command: 'exit' }, async ($, e, next) => {
    // Our own follow-up /exit, or a headless/SDK run: exit as asked.
    if (e.origin?.kind === 'plugin' && e.origin.name === $.plugin.name) return next(e)
    if (e.origin?.kind === 'sdk') return next(e)
    if ((await $.session.turns()) === 0) return next(e)

    let answer: string
    try {
      answer = await $.ui.ask('Update CLAUDE.md with the learnings from this session before exiting?', {
        header: 'CLAUDE.md',
        options: [YES, NO, CANCEL],
      })
    } catch {
      return { text: 'Exit cancelled.' }
    }

    if (answer === NO) return next(e)
    if (answer !== YES) return { text: 'Exit cancelled.' }

    const commands = await $.command.list()
    const skill = commands.find(
      c => c.name === `${PLUGIN}:${SKILL}` || (c.plugin === PLUGIN && c.name.endsWith(SKILL)),
    )

    isExitPending = true
    // A command.run hook can't start a command or prompt itself; do it from a timer once /exit returns.
    $.clock.after(0, () => {
      const started = skill
        ? $.command.run({ command: skill.name })
        : $.prompt.submit({ text: FALLBACK_PROMPT })
      started.catch(err => {
        isExitPending = false
        $.ui.toast(`Couldn't start the CLAUDE.md update: ${String(err)}`)
      })
    })

    return {
      text: skill
        ? `Updating CLAUDE.md with /${skill.name}; the session exits when it's done.`
        : `${PLUGIN} isn't installed; updating CLAUDE.md directly. The session exits when it's done.`,
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!isExitPending) return result
    isExitPending = false

    if (e.reason === 'answer') {
      $.command.run({ command: 'exit' }).catch(() => {})
    } else {
      $.ui.toast('CLAUDE.md update did not finish, so the session stays open. Run /exit again when ready.')
    }
    return result
  })
}
