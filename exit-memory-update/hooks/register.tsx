import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Countdown } from '../types'

const PLUGIN = 'claude-md-management'
const SKILL = 'revise-claude-md'

const YES = 'Yes, update and exit'
const NO = 'No, just exit'
const CANCEL = 'Cancel'

// How long the "exiting" band waits after the update, so its summary can be read.
const COUNTDOWN_SECONDS = 5

const FALLBACK_PROMPT = `The session is about to end. Before it does, update CLAUDE.md with the learnings from this session.

1. Review this conversation for durable, non-obvious knowledge a future session would need: commands that work (build, test, lint, run), project conventions, architecture facts, gotchas and pitfalls hit, preferences the user stated.
2. Read the existing CLAUDE.md in the project root (create it if it does not exist). Skip anything it already says, anything derivable from the code itself, and anything that only mattered to this conversation.
3. Make concise, targeted edits under the fitting sections; don't rewrite unrelated content.
4. Finish with a short summary of what you added or changed, or say that there was nothing worth recording.`

const countdown = atom({ plugin: 'exit-memory-update', key: 'countdown' } as const, null)

const isClaudeMd = (path: string) => /(^|[\\/])CLAUDE\.md$/.test(path)

const describeEdits = (edits: number) =>
  edits === 0 ? 'No changes to CLAUDE.md.' : `CLAUDE.md updated (${edits} ${edits === 1 ? 'edit' : 'edits'}).`

// The countdown's ticking timer, while the band counts down to exit.
let tick: Timer | undefined

async function stopCountdown($: EngineInterface) {
  tick?.cancel()
  tick = undefined
  await update($, countdown, () => null)
}

async function exitNow($: EngineInterface) {
  await stopCountdown($)
  $.command.run({ command: 'exit' }).catch(() => {})
}

async function stay($: EngineInterface) {
  await stopCountdown($)
  $.ui.toast("Staying in the session. Run /exit when you're ready.")
}

export const register: Register = on => {
  // Set while the update turn runs; when it finishes we run /exit for real.
  let isExitPending = false
  // Successful Edit/Write calls on a CLAUDE.md: this session's, and the update turn's.
  let sessionEdits = 0
  let updateEdits = 0

  on('session.start', async ($, e, next) => {
    isExitPending = false
    sessionEdits = 0
    updateEdits = 0
    await stopCountdown($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const isEdit = (e.tool === 'Edit' || e.tool === 'Write') && isClaudeMd(e.file_path)
    if (isEdit && !result.deny && !result.isError) {
      sessionEdits++
      if (isExitPending) updateEdits++
    }
    return result
  })

  on('command.run', { command: 'exit' }, async ($, e, next) => {
    // Our own follow-up /exit, or a headless/SDK run: exit as asked.
    if (e.origin?.kind === 'plugin' && e.origin.name === $.plugin.name) return next(e)
    if (e.origin?.kind === 'sdk') return next(e)
    // Already counting down to exit: /exit again just skips the wait.
    if (tick) {
      await stopCountdown($)
      return next(e)
    }
    if ((await $.session.turns()) === 0) return next(e)

    const commands = await $.command.list()
    const skill = commands.find(
      c => c.name === `${PLUGIN}:${SKILL}` || (c.plugin === PLUGIN && c.name.endsWith(SKILL)),
    )

    const question = sessionEdits > 0
      ? 'CLAUDE.md was already updated this session. Update it again with the latest learnings before exiting?'
      : "Update CLAUDE.md with this session's learnings before exiting?"
    const how = skill ? `Runs /${skill.name}.` : `Claude edits it directly (${PLUGIN} isn't installed).`

    let answer: string
    try {
      answer = await $.ui.ask(`${question} ${how} To steer it, pick Type something and say what to focus on.`, {
        header: 'CLAUDE.md',
        options: [YES, NO, CANCEL],
      })
    } catch {
      return { text: 'Exit cancelled.' }
    }

    if (answer === NO) return next(e)
    // Anything typed under "Type something" is guidance for the update, not a cancel.
    const guidance = answer === YES || answer === CANCEL ? '' : answer.trim()
    if (answer !== YES && !guidance) return { text: 'Exit cancelled.' }

    isExitPending = true
    updateEdits = 0
    $.ui.status('Updating CLAUDE.md, then exiting · Esc to stay')
    // A command.run hook can't start a command or prompt itself; do it from a timer once /exit returns.
    $.clock.after(0, () => {
      const started = skill
        ? $.command.run({ command: skill.name, args: guidance })
        : $.prompt.submit({
            text: guidance ? `${FALLBACK_PROMPT}\n\nThe user asked to focus on: ${guidance}` : FALLBACK_PROMPT,
          })
      started.catch(err => {
        isExitPending = false
        $.ui.status(undefined)
        $.ui.toast(`Couldn't start the CLAUDE.md update: ${String(err)}`)
      })
    })

    const focus = guidance ? ` (focus: ${guidance})` : ''
    return {
      text: skill
        ? `Updating CLAUDE.md with /${skill.name}${focus}; the session exits when it's done.`
        : `${PLUGIN} isn't installed; updating CLAUDE.md directly${focus}. The session exits when it's done.`,
    }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!isExitPending) return result
    isExitPending = false
    $.ui.status(undefined)

    if (e.reason !== 'answer') {
      $.ui.toast('CLAUDE.md update did not finish, so the session stays open. Run /exit again when ready.')
      return result
    }

    // Leave the summary on screen for a few seconds; the band offers Exit now and Stay.
    const edits = updateEdits
    await update($, countdown, () => ({ seconds: COUNTDOWN_SECONDS, edits }))
    tick?.cancel()
    tick = $.clock.every(1000, async () => {
      const left = ((await read($, countdown))?.seconds ?? 1) - 1
      if (left <= 0) return exitNow($)
      await update($, countdown, c => (c ? { ...c, seconds: left } : c))
    })
    return result
  })

  // Typing a new prompt during the countdown means the person wants to stay.
  on('prompt.submit', async ($, e, next) => {
    if (tick) await stopCountdown($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state: Countdown | null = await read($, countdown)
    if (!state || e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={2}>
        <Text>
          {describeEdits(state.edits)} <Text dimColor>Exiting in {state.seconds}s</Text>
        </Text>
        <Button key="exit" label="Exit now" hotkey="1" plain onPress={() => exitNow($)} />
        <Button key="stay" label="Stay" hotkey="2" plain onPress={() => stay($)} />
      </Box>
    )
  })
}
