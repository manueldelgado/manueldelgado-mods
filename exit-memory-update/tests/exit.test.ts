import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const SKILL = 'claude-md-management:revise-claude-md'

function setup(on: On, answer: string, hasPlugin: boolean) {
  const clock = mock.clock(on)
  const seen = { clock, exits: 0, skillRuns: 0, prompts: [] as string[], toasts: [] as string[] }
  on('ui.toast', (_, e) => (seen.toasts.push(JSON.stringify(e)), { value: undefined }))
  on('session.turns', () => ({ value: 3 }))
  on('command.list', () => ({
    value: hasPlugin
      ? [{ name: SKILL, description: 'x', source: 'plugin' as const, plugin: 'claude-md-management' }]
      : [],
  }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const question = e.questions[0]!.question
    return {
      result: { questions: e.questions, answers: { [question]: answer } },
      text: `User has answered your questions: "${question}"="${answer}".`,
    } as never
  })
  on('command.run', { command: 'exit' }, () => (seen.exits++, { text: 'bye' }))
  on('command.run', { command: SKILL }, () => (seen.skillRuns++, {}))
  on('prompt.submit', (_, e) => (seen.prompts.push(e.text), { text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  return seen
}

const runExit = ($: Engine) => $.command.run({
    command: 'exit',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

test('No exits right away', async ($, on) => {
  const seen = setup(on, 'No, just exit', true)
  await runExit($)
  expect(seen.exits).toBe(1)
})

test('Cancel keeps the session open', async ($, on) => {
  const seen = setup(on, 'Cancel', true)
  await runExit($)
  expect(seen.exits).toBe(0)
})

test('Yes with claude-md-management runs its skill, not the fallback', async ($, on) => {
  const seen = setup(on, 'Yes, update and exit', true)
  await runExit($)
  await seen.clock.settle()
  expect(seen.toasts).toEqual([])
  expect(seen.skillRuns).toBe(1)
  expect(seen.prompts.length).toBe(0)
  expect(seen.exits).toBe(0)
})

test('Yes without the plugin submits the built-in prompt', async ($, on) => {
  const seen = setup(on, 'Yes, update and exit', false)
  await runExit($)
  await seen.clock.settle()
  expect(seen.skillRuns).toBe(0)
  expect(seen.prompts[0]).toContain('CLAUDE.md')
  expect(seen.exits).toBe(0)
})
