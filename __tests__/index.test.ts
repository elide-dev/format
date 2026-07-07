import { describe, expect, it, jest, mock } from 'bun:test'

const runMock = jest.fn().mockResolvedValue(undefined)

mock.module('../src/main', () => ({ run: runMock }))

describe('index', () => {
  it('calls run when imported', async () => {
    await import('../src/index')
    expect(runMock).toHaveBeenCalled()
  })
})
