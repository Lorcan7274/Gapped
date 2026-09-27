import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuthCodeEcho } from './env.js'

test('code echo is on by default outside production', () => {
  assert.equal(resolveAuthCodeEcho({ isProduction: false, requested: undefined }), true)
})

test('code echo can be switched off outside production', () => {
  for (const requested of ['0', 'false', 'no', '']) {
    assert.equal(resolveAuthCodeEcho({ isProduction: false, requested }), false, requested)
  }
})

test('code echo can be switched on explicitly outside production', () => {
  for (const requested of ['1', 'true', 'TRUE', ' 1 ']) {
    assert.equal(resolveAuthCodeEcho({ isProduction: false, requested }), true, requested)
  }
})

test('code echo is always off in production', () => {
  assert.equal(resolveAuthCodeEcho({ isProduction: true, requested: undefined }), false)
  assert.equal(resolveAuthCodeEcho({ isProduction: true, requested: '0' }), false)
  assert.equal(resolveAuthCodeEcho({ isProduction: true, requested: 'false' }), false)
})

test('asking for code echo in production refuses to start', () => {
  for (const requested of ['1', 'true', 'True']) {
    assert.throws(
      () => resolveAuthCodeEcho({ isProduction: true, requested }),
      /AUTH_CODE_ECHO is set in production/,
      requested
    )
  }
})
