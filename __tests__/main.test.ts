import { describe, it, expect, beforeEach, jest, mock } from 'bun:test'

const readdirSyncMock = jest.fn().mockReturnValue([])
const statSyncMock = jest.fn().mockReturnValue({ isDirectory: () => false })

mock.module('node:fs', () => ({
  readdirSync: readdirSyncMock,
  statSync: statSyncMock
}))

const runFormatterMock = jest.fn().mockResolvedValue(0)

mock.module('../src/command', () => ({
  runFormatter: runFormatterMock,
  buildFormatterArgs: jest.fn()
}))

const debugMock = jest.fn()
const infoMock = jest.fn()
const warningMock = jest.fn()
const errorMock = jest.fn()
const setFailedMock = jest.fn()
const setOutputMock = jest.fn()
const groupMock = jest.fn(async (_name: string, fn: () => Promise<any>) => fn())
const summaryMock = {
  addHeading: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  write: jest.fn().mockResolvedValue(undefined)
}
const initTelemetryMock = jest.fn()
const reportErrorMock = jest.fn()
const flushTelemetryMock = jest.fn().mockResolvedValue(undefined)
const withSpanMock = jest.fn(
  async (_name: string, _op: string, fn: () => Promise<any>) => fn()
)
const recordMetricMock = jest.fn()
const logEventMock = jest.fn()

mock.module('@actions/core', () => ({
  info: infoMock,
  debug: debugMock,
  error: errorMock,
  warning: warningMock,
  getInput: jest.fn().mockReturnValue(''),
  getBooleanInput: jest.fn().mockReturnValue(true),
  setFailed: setFailedMock,
  setOutput: setOutputMock,
  group: groupMock,
  summary: summaryMock
}))
mock.module('../src/telemetry', () => ({
  initTelemetry: initTelemetryMock,
  reportError: reportErrorMock,
  flushTelemetry: flushTelemetryMock,
  withSpan: withSpanMock,
  recordMetric: recordMetricMock,
  logEvent: logEventMock
}))

const {
  run,
  resolveFiles,
  findFiles,
  matchesExcludePattern,
  applyExclusions,
  ActionOutputName
} = await import('../src/main')
const { default: buildOptions } = await import('../src/options')

const resetMocks = () => {
  readdirSyncMock.mockReturnValue([])
  statSyncMock.mockReturnValue({ isDirectory: () => false })
  runFormatterMock.mockResolvedValue(0)
  groupMock.mockImplementation(async (_: string, fn: () => Promise<any>) =>
    fn()
  )
  withSpanMock.mockImplementation(
    async (_: string, __: string, fn: () => Promise<any>) => fn()
  )
  flushTelemetryMock.mockResolvedValue(undefined)
  summaryMock.addHeading.mockReturnThis()
  summaryMock.addTable.mockReturnThis()
  summaryMock.write.mockResolvedValue(undefined)
}

const clearAllMocks = () => {
  // mockReset clears both call history and any per-test implementations, preventing bleed-through
  debugMock.mockReset()
  infoMock.mockReset()
  warningMock.mockReset()
  errorMock.mockReset()
  setFailedMock.mockReset()
  setOutputMock.mockReset()
  groupMock.mockReset()
  runFormatterMock.mockReset()
  readdirSyncMock.mockReset()
  statSyncMock.mockReset()
  initTelemetryMock.mockReset()
  reportErrorMock.mockReset()
  flushTelemetryMock.mockReset()
  withSpanMock.mockReset()
  recordMetricMock.mockReset()
  logEventMock.mockReset()
  summaryMock.addHeading.mockReset()
  summaryMock.addTable.mockReset()
  summaryMock.write.mockReset()
}

describe('findFiles', () => {
  beforeEach(() => readdirSyncMock.mockClear())

  it('should return files with the matching extension', () => {
    readdirSyncMock.mockReturnValue(['src/Main.java', 'src/Foo.java'])
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('Main.java')
  })

  it('should skip files inside excluded directories', () => {
    readdirSyncMock.mockReturnValue([
      'src/Main.java',
      'node_modules/Dep.java',
      'build/Out.java',
      'target/Target.java',
      '.gradle/Cached.java'
    ])
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Main.java')
  })

  it('should return empty array when no matching files exist', () => {
    readdirSyncMock.mockReturnValue(['src/App.kt', 'src/Main.kt'])
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(0)
  })

  it('should return all matching files at any depth', () => {
    readdirSyncMock.mockReturnValue([
      'a/Main.java',
      'a/b/c/Deep.java',
      'README.md'
    ])
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(2)
  })
})

describe('resolveFiles', () => {
  beforeEach(() => {
    readdirSyncMock.mockReturnValue([])
    statSyncMock.mockReturnValue({ isDirectory: () => false })
  })

  it('should return resolved files from options when provided', () => {
    const opts = buildOptions({
      files: ['/workspace/Foo.java', '/workspace/Bar.java'],
      working_directory: '/workspace'
    })
    expect(resolveFiles(opts, 'javaformat')).toEqual([
      '/workspace/Foo.java',
      '/workspace/Bar.java'
    ])
  })

  it('should resolve relative paths against working_directory', () => {
    const opts = buildOptions({
      files: ['Foo.java', 'Bar.java'],
      working_directory: '/workspace'
    })
    expect(resolveFiles(opts, 'javaformat')).toEqual([
      '/workspace/Foo.java',
      '/workspace/Bar.java'
    ])
  })

  it('should expand directory entries', () => {
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readdirSyncMock.mockReturnValue(['Main.java', 'Foo.java'])
    const opts = buildOptions({
      files: ['/workspace/src'],
      working_directory: '/workspace'
    })
    const result = resolveFiles(opts, 'javaformat')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('Main.java')
  })

  it('should scan for .java files for javaformat when no files provided', () => {
    readdirSyncMock.mockReturnValue(['src/Main.java'])
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    const result = resolveFiles(opts, 'javaformat')
    expect(result[0]).toContain('Main.java')
  })

  it('should scan for .kt files for ktfmt when no files provided', () => {
    readdirSyncMock.mockReturnValue(['src/Main.kt'])
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    const result = resolveFiles(opts, 'ktfmt')
    expect(result[0]).toContain('Main.kt')
  })

  it('should return empty array when no files found by extension scan', () => {
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    expect(resolveFiles(opts, 'ktfmt')).toEqual([])
  })

  it('should not include .kts files for ktfmt by default', () => {
    readdirSyncMock.mockReturnValue(['src/Main.kt', 'build.kts'])
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    const result = resolveFiles(opts, 'ktfmt')
    expect(result.some(f => f.endsWith('.kts'))).toBe(false)
    expect(result.some(f => f.endsWith('.kt'))).toBe(true)
  })

  it('should include .kts files for ktfmt when include_kts is true', () => {
    readdirSyncMock.mockReturnValue(['src/Main.kt', 'build.kts'])
    const opts = buildOptions({
      files: [],
      working_directory: '/workspace',
      include_kts: true
    })
    const result = resolveFiles(opts, 'ktfmt')
    expect(result.some(f => f.endsWith('.kts'))).toBe(true)
    expect(result.some(f => f.endsWith('.kt'))).toBe(true)
  })

  it('should never include .kts files for javaformat', () => {
    readdirSyncMock.mockReturnValue(['Foo.java', 'build.kts'])
    const opts = buildOptions({
      files: [],
      working_directory: '/workspace',
      include_kts: true
    })
    const result = resolveFiles(opts, 'javaformat')
    expect(result.some(f => f.endsWith('.kts'))).toBe(false)
    expect(result.some(f => f.endsWith('.java'))).toBe(true)
  })

  it('should expand directory into .kt and .kts when include_kts is true', () => {
    statSyncMock.mockReturnValue({ isDirectory: () => true })
    readdirSyncMock
      .mockReturnValueOnce(['Main.kt'])
      .mockReturnValueOnce(['build.kts'])
    const opts = buildOptions({
      files: ['/workspace/src'],
      working_directory: '/workspace',
      include_kts: true
    })
    const result = resolveFiles(opts, 'ktfmt')
    expect(result.some(f => f.endsWith('.kt'))).toBe(true)
    expect(result.some(f => f.endsWith('.kts'))).toBe(true)
  })
})

describe('matchesExcludePattern', () => {
  it('should match a plain directory name as a path segment', () => {
    expect(
      matchesExcludePattern('/workspace/src/generated/Foo.java', 'generated')
    ).toBe(true)
  })

  it('should match a plain path prefix', () => {
    expect(
      matchesExcludePattern(
        '/workspace/src/generated/Foo.java',
        'src/generated'
      )
    ).toBe(true)
  })

  it('should not match a plain string that is not a segment', () => {
    expect(
      matchesExcludePattern('/workspace/src/generated/Foo.java', 'generat')
    ).toBe(false)
  })

  it('should match a ** glob pattern', () => {
    expect(
      matchesExcludePattern(
        '/workspace/src/generated/Foo.java',
        '**/generated/**'
      )
    ).toBe(true)
  })

  it('should match a * glob within a segment', () => {
    expect(
      matchesExcludePattern('/workspace/src/FooGenerated.java', '*Generated*')
    ).toBe(false) // * does not cross path separators
    expect(
      matchesExcludePattern(
        '/workspace/src/FooGenerated.java',
        '**/*Generated*'
      )
    ).toBe(true)
  })

  it('should not match an unrelated path', () => {
    expect(matchesExcludePattern('/workspace/src/Main.java', 'generated')).toBe(
      false
    )
  })
})

describe('applyExclusions', () => {
  it('should return all files when no patterns provided', () => {
    const files = ['/workspace/Main.java', '/workspace/Foo.java']
    expect(applyExclusions(files, [])).toEqual(files)
  })

  it('should exclude files matching a plain pattern', () => {
    const files = [
      '/workspace/src/Main.java',
      '/workspace/src/generated/Gen.java'
    ]
    expect(applyExclusions(files, ['generated'])).toEqual([
      '/workspace/src/Main.java'
    ])
  })

  it('should exclude files matching a glob pattern', () => {
    const files = [
      '/workspace/src/Main.java',
      '/workspace/src/generated/Gen.java',
      '/workspace/src/proto/Proto.java'
    ]
    expect(applyExclusions(files, ['**/generated/**', '**/proto/**'])).toEqual([
      '/workspace/src/Main.java'
    ])
  })

  it('should work with explicit files list', () => {
    const files = ['src/Main.java', 'src/generated/Gen.java']
    expect(applyExclusions(files, ['generated'])).toEqual(['src/Main.java'])
  })
})

describe('run', () => {
  beforeEach(() => {
    clearAllMocks()
    resetMocks()
  })

  it('should set result=success on clean check', async () => {
    runFormatterMock.mockResolvedValue(0)
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(setOutputMock).toHaveBeenCalledWith(
      ActionOutputName.RESULT,
      'success'
    )
  })

  it('should set result=failure when formatter exits non-zero', async () => {
    runFormatterMock.mockResolvedValue(1)
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(setOutputMock).toHaveBeenCalledWith(
      ActionOutputName.RESULT,
      'failure'
    )
  })

  it('should call setFailed when fail_on_error is true and check fails', async () => {
    runFormatterMock.mockResolvedValue(1)
    await run({ formatter: 'ktfmt', files: ['Main.kt'], fail_on_error: true })
    expect(setFailedMock).toHaveBeenCalledWith(
      expect.stringContaining('Format check failed')
    )
  })

  it('should warn instead of failing when fail_on_error is false', async () => {
    runFormatterMock.mockResolvedValue(1)
    await run({ formatter: 'ktfmt', files: ['Main.kt'], fail_on_error: false })
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(warningMock).toHaveBeenCalledWith(
      expect.stringContaining('Format check failed'),
      expect.objectContaining({ title: 'Format Check Failed' })
    )
  })

  it('should run both formatters when formatter=all', async () => {
    await run({ formatter: 'all', files: ['Main.java'] })
    expect(runFormatterMock).toHaveBeenCalledTimes(2)
    expect(runFormatterMock).toHaveBeenCalledWith(
      'javaformat',
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      expect.any(String)
    )
    expect(runFormatterMock).toHaveBeenCalledWith(
      'ktfmt',
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      expect.any(String)
    )
  })

  it('should run only javaformat when formatter=javaformat', async () => {
    await run({ formatter: 'javaformat', files: ['Main.java'] })
    expect(runFormatterMock).toHaveBeenCalledTimes(1)
    expect(runFormatterMock).toHaveBeenCalledWith(
      'javaformat',
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      expect.any(String)
    )
  })

  it('should skip formatter and not fail when no files found', async () => {
    readdirSyncMock.mockReturnValue([])
    await run({ formatter: 'ktfmt' })
    expect(runFormatterMock).not.toHaveBeenCalled()
    expect(setFailedMock).not.toHaveBeenCalled()
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining('No .kt files found')
    )
  })

  it('should pass gjf_args to javaformat', async () => {
    await run({
      formatter: 'javaformat',
      files: ['Main.java'],
      gjf_args: ['--aosp']
    })
    expect(runFormatterMock).toHaveBeenCalledWith(
      'javaformat',
      expect.any(String),
      expect.any(Array),
      ['--aosp'],
      expect.any(String)
    )
  })

  it('should pass ktfmt_args to ktfmt', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      ktfmt_args: ['--google-style']
    })
    expect(runFormatterMock).toHaveBeenCalledWith(
      'ktfmt',
      expect.any(String),
      expect.any(Array),
      ['--google-style'],
      expect.any(String)
    )
  })

  it('should set files-checked output', async () => {
    readdirSyncMock.mockReturnValue(['Main.kt', 'Foo.kt'])
    await run({ formatter: 'ktfmt' })
    expect(setOutputMock).toHaveBeenCalledWith(
      ActionOutputName.FILES_CHECKED,
      expect.any(String)
    )
  })

  it('should initialize telemetry', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(initTelemetryMock).toHaveBeenCalled()
  })

  it('should flush telemetry in finally block', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(flushTelemetryMock).toHaveBeenCalled()
  })

  it('should flush telemetry even when an error is thrown', async () => {
    infoMock.mockImplementation((msg: string) => {
      if (msg.includes('formatter=')) throw new Error('unexpected failure')
    })
    await run({ formatter: 'ktfmt' })
    expect(flushTelemetryMock).toHaveBeenCalled()
  })

  it('should report errors to telemetry on exception', async () => {
    infoMock.mockImplementation((msg: string) => {
      if (msg.includes('formatter=')) throw new Error('unexpected failure')
    })
    await run({ formatter: 'ktfmt' })
    expect(reportErrorMock).toHaveBeenCalled()
    expect(setFailedMock).toHaveBeenCalled()
  })

  it('should emit start and exit log events', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(logEventMock).toHaveBeenCalledWith(
      'format.start',
      expect.objectContaining({ formatter: 'ktfmt', mode: 'check' })
    )
    expect(logEventMock).toHaveBeenCalledWith(
      'format.exit',
      expect.objectContaining({ status: 'success' })
    )
  })

  it('should emit failure status in exit event when check fails', async () => {
    runFormatterMock.mockResolvedValue(1)
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      fail_on_error: false
    })
    expect(logEventMock).toHaveBeenCalledWith(
      'format.exit',
      expect.objectContaining({ status: 'failure' })
    )
  })

  it('should record duration metric', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(recordMetricMock).toHaveBeenCalledWith(
      'format.duration_ms',
      expect.any(Number),
      'millisecond',
      expect.objectContaining({ formatter: 'ktfmt', mode: 'check' })
    )
  })

  it('should write summary on success', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(summaryMock.addHeading).toHaveBeenCalledWith(
      'Format Check Passed',
      2
    )
    expect(summaryMock.write).toHaveBeenCalled()
  })

  it('should write failure summary when check fails', async () => {
    runFormatterMock.mockResolvedValue(1)
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      fail_on_error: false
    })
    expect(summaryMock.addHeading).toHaveBeenCalledWith(
      'Format Check Failed',
      2
    )
  })

  it('should use grouped output sections', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(groupMock).toHaveBeenCalledWith(
      'Resolving options',
      expect.any(Function)
    )
    expect(groupMock).toHaveBeenCalledWith(
      'Running ktfmt',
      expect.any(Function)
    )
  })

  it('should wrap execution in tracing spans', async () => {
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(withSpanMock).toHaveBeenCalledWith(
      'format',
      'format',
      expect.any(Function)
    )
    expect(withSpanMock).toHaveBeenCalledWith(
      'format.ktfmt',
      'format',
      expect.any(Function)
    )
  })

  it('should skip excluded files and not invoke formatter', async () => {
    readdirSyncMock.mockReturnValue(['src/Main.kt', 'src/generated/Gen.kt'])
    await run({ formatter: 'ktfmt', exclude: ['generated'] })
    // Only Main.kt survives exclusion
    expect(runFormatterMock).toHaveBeenCalledWith(
      'ktfmt',
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('Main.kt')]),
      expect.any(Array),
      expect.any(String)
    )
    const passedFiles: string[] = runFormatterMock.mock.calls[0][2]
    expect(passedFiles.some((f: string) => f.includes('generated'))).toBe(false)
  })

  it('should skip formatter entirely when all files are excluded', async () => {
    readdirSyncMock.mockReturnValue(['src/generated/Gen.kt'])
    await run({ formatter: 'ktfmt', exclude: ['generated'] })
    expect(runFormatterMock).not.toHaveBeenCalled()
    expect(setFailedMock).not.toHaveBeenCalled()
  })

  it('should apply exclusions to explicit files list', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['/workspace/src/Main.kt', '/workspace/src/generated/Gen.kt'],
      exclude: ['generated'],
      working_directory: '/workspace'
    })
    const passedFiles: string[] = runFormatterMock.mock.calls[0][2]
    expect(passedFiles).toEqual(['/workspace/src/Main.kt'])
  })
})
