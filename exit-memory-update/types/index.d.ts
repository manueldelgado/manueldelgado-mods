export type Countdown = { seconds: number; edits: number }

declare module 'claude-code' {
  interface PluginState {
    'exit-memory-update': { countdown: Countdown | null }
  }
}
