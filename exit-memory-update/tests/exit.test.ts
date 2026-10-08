import { test, expect, mock } from 'claude-code/testing'
import type { On, RenderElement } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const SKILL = 'claude-md-management:revise-claude-md'
const YES = 'Yes, update and exit'

function setup(on: On, answer: string, hasPlugin: boolean) {
  const clock = mock.clock(on)
  const seen = {
    clock,
    exits: 0,
    skillArgs: [] as string[],
    prompts: [] as string[],
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    questions: [] as string[],
  }
  on('ui.toast', (_, e) => (seen.toasts.push(e.text), { value: undefined }))
  on('ui.status', (_, e) => (seen.statuses.push(e.text), { value: undefined }))
  on('session.turns', () => ({ value: 3 }))
  on('command.list', () => ({
    value: hasPlugin
      ? [{ name: SKILL, description: 'x', source: 'plugin' as const, plugin: 'claude-md-management' }]
      : [],
  }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const question = e.questions[0]!.question
    seen.questions.push(question)
    return {
      result: { questions: e.questions, answers: { [question]: answer } },
      text: `User has answered your questions: "${question}"="${answer}".`,
    } as never
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'ok' }) as never)
  on('command.run', { command: 'exit' }, () => (seen.exits++, { text: 'bye' }))
  on('command.run', { command: SKILL }, (_, e) => (seen.skillArgs.push(e.args), {}))
  on('prompt.submit', (_, e) => (seen.prompts.push(e.text), { text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  // The engine's own band: an empty row.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, { key: 'engine' }) as RenderElement)
  return seen
}

const runExit = ($: Engine) => $.command.run({
    command: 'exit',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

const finishTurn = ($: Engine, reason: 'answer' | 'aborted' = 'answer') =>
  $.turn.complete({ answer: 'Added 2 lines.', durationMs: 1000, isAborted: reason === 'aborted', turnId: 't1', reason })

const editClaudeMd = ($: Engine) =>
  $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: '/repo/CLAUDE.md', old_string: 'a', new_string: 'b' })

const BAND = {
  plugin: 'exit-memory-update',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

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
  const seen = setup(on, YES, true)
  await runExit($)
  await seen.clock.settle()
  expect(seen.toasts).toEqual([])
  expect(seen.skillArgs).toEqual([''])
  expect(seen.prompts.length).toBe(0)
  expect(seen.exits).toBe(0)
})

test('Yes without the plugin submits the built-in prompt', async ($, on) => {
  const seen = setup(on, YES, false)
  await runExit($)
  await seen.clock.settle()
  expect(seen.skillArgs.length).toBe(0)
  expect(seen.prompts[0]).toContain('CLAUDE.md')
  expect(seen.exits).toBe(0)
})

test('the question names the skill that will run', async ($, on) => {
  const seen = setup(on, 'Cancel', true)
  await runExit($)
  expect(seen.questions[0]).toContain(`/${SKILL}`)
})

test('the question points to the Type something option for guidance', async ($, on) => {
  const seen = setup(on, 'Cancel', true)
  await runExit($)
  expect(seen.questions[0]).toContain('pick Type something and say what to focus on')
  expect(seen.questions[0]).not.toContain('Other')
})

test('the question says when claude-md-management is missing', async ($, on) => {
  const seen = setup(on, 'Cancel', false)
  await runExit($)
  expect(seen.questions[0]).toContain("isn't installed")
})

test('the question notes an update made earlier in the session', async ($, on) => {
  const seen = setup(on, 'Cancel', true)
  await editClaudeMd($)
  await runExit($)
  expect(seen.questions[0]).toContain('already updated this session')
})

test('text typed under Type something steers the skill', async ($, on) => {
  const seen = setup(on, 'the test commands', true)
  await runExit($)
  await seen.clock.settle()
  expect(seen.skillArgs).toEqual(['the test commands'])
})

test('text typed under Type something steers the built-in prompt', async ($, on) => {
  const seen = setup(on, 'the test commands', false)
  await runExit($)
  await seen.clock.settle()
  expect(seen.prompts[0]).toContain('The user asked to focus on: the test commands')
})

test('a status line shows while the update runs and clears after', async ($, on) => {
  const seen = setup(on, YES, true)
  await runExit($)
  expect(seen.statuses.at(-1)).toContain('Esc to stay')
  await finishTurn($)
  expect(seen.statuses.at(-1)).toBeUndefined()
})

test('an interrupted update keeps the session open without a countdown', async ($, on) => {
  const seen = setup(on, YES, true)
  await runExit($)
  await finishTurn($, 'aborted')
  await seen.clock.advance(10_000)
  expect(seen.exits).toBe(0)
  expect(seen.toasts.at(-1)).toContain('stays open')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band counts down, then exits (${surface})`, async ($, on) => {
    const seen = setup(on, YES, true)
    await runExit($)
    await seen.clock.settle()
    await editClaudeMd($)
    await finishTurn($)

    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: /CLAUDE\.md updated \(1 edit\)/ }))).toBeDefined()
    expect((await band.find({ type: 'Text', text: /Exiting in 5s/ }))).toBeDefined()

    await seen.clock.advance(2000)
    expect((await band.find({ type: 'Text', text: /Exiting in 3s/ }))).toBeDefined()
    expect(seen.exits).toBe(0)

    await seen.clock.advance(3000)
    expect(seen.exits).toBe(1)
  })

  test(`Stay on the band keeps the session open (${surface})`, async ($, on) => {
    const seen = setup(on, YES, true)
    await runExit($)
    await finishTurn($)

    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: /No changes to CLAUDE\.md/ }))).toBeDefined()
    await band.press({ key: 'stay' })
    await seen.clock.advance(10_000)
    expect(seen.exits).toBe(0)
    expect(seen.toasts.at(-1)).toContain('Staying')
    expect(await band.find({ key: 'stay' })).toBeUndefined()
  })

  test(`Exit now on the band exits at once (${surface})`, async ($, on) => {
    const seen = setup(on, YES, true)
    await runExit($)
    await finishTurn($)

    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'exit' })
    expect(seen.exits).toBe(1)
    await seen.clock.advance(10_000)
    expect(seen.exits).toBe(1)
  })
}

const reply = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

test('a new prompt during the countdown cancels it', async ($, on) => {
  const seen = setup(on, YES, true)
  await runExit($)
  await seen.clock.settle()
  await editClaudeMd($)
  await finishTurn($)
  await reply($, 'one more thing')
  await seen.clock.advance(10_000)
  expect(seen.exits).toBe(0)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`an update that only proposes edits waits for the reply instead of exiting (${surface})`, async ($, on) => {
    const seen = setup(on, YES, true)
    await runExit($)
    await seen.clock.settle()
    await finishTurn($)

    await seen.clock.advance(10_000)
    expect(seen.exits).toBe(0)
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /No changes to CLAUDE\.md yet/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /Exiting in/ })).toBeUndefined()
    expect(await band.find({ key: 'exit' })).toBeDefined()
  })
}

test('replying to the proposed edits applies them, then counts down to exit', async ($, on) => {
  const seen = setup(on, YES, true)
  await runExit($)
  await seen.clock.settle()
  await finishTurn($)

  await reply($, 'yes, apply them')
  expect(seen.statuses.at(-1)).toContain('Esc to stay')
  await editClaudeMd($)
  await finishTurn($)
  expect(seen.statuses.at(-1)).toBeUndefined()
  expect(seen.exits).toBe(0)
  await seen.clock.advance(5000)
  expect(seen.exits).toBe(1)
})

test('a reply that applies nothing keeps waiting', async ($, on) => {
  const seen = setup(on, YES, true)
  await runExit($)
  await seen.clock.settle()
  await finishTurn($)
  await reply($, "no, don't apply them")
  await finishTurn($)
  await seen.clock.advance(10_000)
  expect(seen.exits).toBe(0)
})

test('/exit while waiting for the reply exits without asking again', async ($, on) => {
  const seen = setup(on, YES, true)
  await runExit($)
  await seen.clock.settle()
  await finishTurn($)
  await runExit($)
  expect(seen.questions.length).toBe(1)
  expect(seen.exits).toBe(1)
})
