export type RouterMode = 'auto' | 'opus' | 'sonnet' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'pearl-router': { mode: RouterMode }
  }
}
