import { describe, expect, it } from 'vitest'
import { SECURE_WEB_PREFERENCES } from './webPreferences'

describe('SECURE_WEB_PREFERENCES', () => {
  it('enforces the SPEC §8 security baseline', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    })
  })
})
