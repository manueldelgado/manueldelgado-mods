// `seconds` counts down to exit; without it, the band waits for the person's reply to the update.
export type Countdown = { seconds?: number; edits: number }

declare module 'claude-code' {
  interface PluginState {
    'exit-memory-update': { countdown: Countdown | null }
  }
}
