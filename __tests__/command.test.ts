import { describe, it, expect, beforeEach, jest, mock } from 'bun:test'

const execMock = jest.fn().mockResolvedValue(0)
const debugMock = jest.fn()
const writeFileSyncMock = jest.fn()
const unlinkSyncMock = jest.fn()

mock.module('@actions/exec', () => ({
  exec: execMock,
  getExecOutput: jest.fn()
}))
mock.module('@actions/core', () => ({
  debug: debugMock,
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  getInput: jest.fn().mockReturnValue(''),
  setFailed: jest.fn(),
  setOutput: jest.fn()
}))
mock.module('node:fs', () => ({
  writeFileSync: writeFileSyncMock,
  unlinkSync: unlinkSyncMock
}))

const { buildFormatterArgs, runFormatter } = await import('../src/command')

describe('buildFormatterArgs', () => {
  it('should build javaformat check args', () => {
    expect(buildFormatterArgs('javaformat', 'check', ['Foo.java'], [])).toEqual(
      ['javaformat', '--', '--dry-run', '--set-exit-if-changed', 'Foo.java']
    )
  })

  it('should build javaformat write args', () => {
    expect(buildFormatterArgs('javaformat', 'write', ['Foo.java'], [])).toEqual(
      ['javaformat', '--', 'Foo.java']
    )
  })

  it('should build ktfmt check args', () => {
    expect(buildFormatterArgs('ktfmt', 'check', ['Main.kt'], [])).toEqual([
      'ktfmt',
      '--',
      '--dry-run',
      '--set-exit-if-changed',
      'Main.kt'
    ])
  })

  it('should build ktfmt write args', () => {
    expect(buildFormatterArgs('ktfmt', 'write', ['Main.kt'], [])).toEqual([
      'ktfmt',
      '--',
      'Main.kt'
    ])
  })

  it('should spread multiple files as separate arguments', () => {
    expect(buildFormatterArgs('ktfmt', 'check', ['A.kt', 'B.kt'], [])).toEqual([
      'ktfmt',
      '--',
      '--dry-run',
      '--set-exit-if-changed',
      'A.kt',
      'B.kt'
    ])
  })

  it('should place extra args before files', () => {
    expect(
      buildFormatterArgs('ktfmt', 'check', ['Main.kt'], ['--google-style'])
    ).toEqual([
      'ktfmt',
      '--',
      '--dry-run',
      '--set-exit-if-changed',
      '--google-style',
      'Main.kt'
    ])
  })

  it('should place extra args before files in write mode', () => {
    expect(
      buildFormatterArgs('javaformat', 'write', ['Foo.java'], ['--aosp'])
    ).toEqual(['javaformat', '--', '--aosp', 'Foo.java'])
  })

  it('should always include the -- separator', () => {
    const args = buildFormatterArgs('ktfmt', 'write', ['Main.kt'], [])
    expect(args[1]).toBe('--')
  })
})

describe('runFormatter', () => {
  beforeEach(() => {
    execMock.mockReset()
    debugMock.mockReset()
    writeFileSyncMock.mockReset()
    unlinkSyncMock.mockReset()
    execMock.mockResolvedValue(0)
  })

  it('should pass files via argfile to exec', async () => {
    await runFormatter(
      'ktfmt',
      'check',
      ['Main.kt', 'Foo.kt'],
      [],
      '/workspace'
    )
    const passedArgs: string[] = execMock.mock.calls[0][1]
    const argfileArg = passedArgs.find((a: string) => a.startsWith('@'))
    expect(argfileArg).toBeDefined()
    expect(passedArgs).not.toContain('Main.kt')
    expect(passedArgs).not.toContain('Foo.kt')
    // ktfmt: flags and files all go in the argfile
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('format-ktfmt.txt'),
      '--dry-run\n--set-exit-if-changed\nMain.kt\nFoo.kt',
      'utf-8'
    )
  })

  it('should call exec with elide and correct mode args', async () => {
    await runFormatter('ktfmt', 'check', ['Main.kt'], [], '/workspace')
    // ktfmt: only @argfile follows --, flags are written into the file
    const passedArgs: string[] = execMock.mock.calls[0][1]
    expect(passedArgs[0]).toBe('ktfmt')
    expect(passedArgs[1]).toBe('--')
    expect(passedArgs[2]).toMatch(/^@.*format-ktfmt\.txt$/)
    expect(passedArgs).not.toContain('--dry-run')
    expect(passedArgs).not.toContain('--set-exit-if-changed')
    expect(execMock).toHaveBeenCalledWith(
      'elide',
      expect.anything(),
      expect.objectContaining({ cwd: '/workspace', ignoreReturnCode: true })
    )
  })

  it('should call exec with javaformat check args', async () => {
    await runFormatter('javaformat', 'check', ['Foo.java'], [], '/workspace')
    expect(execMock).toHaveBeenCalledWith(
      'elide',
      expect.arrayContaining([
        'javaformat',
        '--',
        '--dry-run',
        '--set-exit-if-changed',
        expect.stringContaining('format-javaformat.txt')
      ]),
      expect.anything()
    )
  })

  it('should return the exit code', async () => {
    execMock.mockResolvedValue(1)
    const code = await runFormatter(
      'ktfmt',
      'check',
      ['Main.kt'],
      [],
      '/workspace'
    )
    expect(code).toBe(1)
  })

  it('should log a debug message with file count', async () => {
    await runFormatter(
      'javaformat',
      'check',
      ['Foo.java', 'Bar.java'],
      [],
      '/workspace'
    )
    expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('2 files'))
  })

  it('should propagate exec errors', async () => {
    execMock.mockRejectedValue(new Error('exec failed'))
    await expect(
      runFormatter('ktfmt', 'check', ['Main.kt'], [], '/workspace')
    ).rejects.toThrow('exec failed')
  })
})
