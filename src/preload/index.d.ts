import type { CubicleApi } from '../../packages/shared/src/ipc'

declare global {
  interface Window {
    cubicle: CubicleApi
  }
}

export {}
