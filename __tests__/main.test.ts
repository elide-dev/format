import { describe, it, expect, beforeEach, jest, mock } from 'bun:test'

const readdirSyncMock = jest.fn().mockReturnValue([])
const statSyncMock = jest.fn().mockReturnValue({ isDirectory: () => false })

mock.module('node:fs', () => ({
  readdirSync: readdirSyncMock,
  statSync: statSyncMock
}))

const runFormatterMock = jest
  .fn()
  .mockResolvedValue({ exitCode: 0, stdout: '' })

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
  ActionOutputName,
  buildElideFlags,
  parseListedFiles,
  parseDiffOutput,
  isDiffOutput,
  printOutputModeResult
} = await import('../src/main')
const { default: buildOptions } = await import('../src/options')

const resetMocks = () => {
  readdirSyncMock.mockReturnValue([])
  statSyncMock.mockReturnValue({ isDirectory: () => false })
  runFormatterMock.mockResolvedValue({ exitCode: 0, stdout: '' })
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

const f = (name: string) => ({ name, isDirectory: () => false })
const d = (name: string) => ({ name, isDirectory: () => true })

describe('findFiles', () => {
  beforeEach(() => readdirSyncMock.mockReset())

  it('should return files with the matching extension', () => {
    readdirSyncMock.mockReturnValue([f('Main.java'), f('Foo.java')])
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('Main.java')
  })

  it('should return all matching files regardless of directory name', () => {
    readdirSyncMock.mockImplementation((dir: string) => {
      if (String(dir) === '/workspace') return [d('src'), d('node_modules')]
      if (String(dir).endsWith('src')) return [f('Main.java')]
      if (String(dir).endsWith('node_modules')) return [f('Dep.java')]
      return []
    })
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(2)
  })

  it('should return empty array when no matching files exist', () => {
    readdirSyncMock.mockReturnValue([f('App.kt'), f('Main.kt')])
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(0)
  })

  it('should return all matching files at any depth', () => {
    readdirSyncMock.mockImplementation((dir: string) => {
      if (String(dir) === '/workspace') return [d('a'), f('README.md')]
      if (String(dir).endsWith('/a')) return [f('Main.java'), d('b')]
      if (String(dir).endsWith('/b')) return [d('c')]
      if (String(dir).endsWith('/c')) return [f('Deep.java')]
      return []
    })
    const result = findFiles('/workspace', '.java')
    expect(result).toHaveLength(2)
  })

  it('should prune directories matching exclude patterns', () => {
    readdirSyncMock.mockImplementation((dir: string) => {
      if (String(dir).endsWith('node_modules')) return [f('Dep.java')]
      return [f('Main.java'), d('node_modules')]
    })
    const result = findFiles('/workspace', '.java', ['node_modules'])
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Main.java')
    expect(readdirSyncMock).not.toHaveBeenCalledWith(
      expect.stringContaining('node_modules'),
      expect.anything()
    )
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
    readdirSyncMock.mockReturnValue([f('Main.java'), f('Foo.java')])
    const opts = buildOptions({
      files: ['/workspace/src'],
      working_directory: '/workspace'
    })
    const result = resolveFiles(opts, 'javaformat')
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('Main.java')
  })

  it('should scan for .java files for javaformat when no files provided', () => {
    readdirSyncMock.mockReturnValue([f('Main.java')])
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    const result = resolveFiles(opts, 'javaformat')
    expect(result[0]).toContain('Main.java')
  })

  it('should scan for .kt files for ktfmt when no files provided', () => {
    readdirSyncMock.mockReturnValue([f('Main.kt')])
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    const result = resolveFiles(opts, 'ktfmt')
    expect(result[0]).toContain('Main.kt')
  })

  it('should return empty array when no files found by extension scan', () => {
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    expect(resolveFiles(opts, 'ktfmt')).toEqual([])
  })

  it('should not include .kts files for ktfmt by default', () => {
    readdirSyncMock.mockReturnValue([f('Main.kt'), f('build.kts')])
    const opts = buildOptions({ files: [], working_directory: '/workspace' })
    const result = resolveFiles(opts, 'ktfmt')
    expect(result.some(f => f.endsWith('.kts'))).toBe(false)
    expect(result.some(f => f.endsWith('.kt'))).toBe(true)
  })

  it('should include .kts files for ktfmt when include_kts is true', () => {
    readdirSyncMock.mockReturnValue([f('Main.kt'), f('build.kts')])
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
    readdirSyncMock.mockReturnValue([f('Foo.java'), f('build.kts')])
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
      .mockReturnValueOnce([f('Main.kt')])
      .mockReturnValueOnce([f('build.kts')])
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
    runFormatterMock.mockResolvedValue({ exitCode: 0, stdout: '' })
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(setOutputMock).toHaveBeenCalledWith(
      ActionOutputName.RESULT,
      'success'
    )
  })

  it('should set result=failure when formatter exits non-zero', async () => {
    runFormatterMock.mockResolvedValue({ exitCode: 1, stdout: '' })
    await run({ formatter: 'ktfmt', files: ['Main.kt'] })
    expect(setOutputMock).toHaveBeenCalledWith(
      ActionOutputName.RESULT,
      'failure'
    )
  })

  it('should call setFailed when fail_on_error is true and check fails', async () => {
    runFormatterMock.mockResolvedValue({ exitCode: 1, stdout: '' })
    await run({ formatter: 'ktfmt', files: ['Main.kt'], fail_on_error: true })
    expect(setFailedMock).toHaveBeenCalledWith(
      expect.stringContaining('Format check failed')
    )
  })

  it('should warn instead of failing when fail_on_error is false', async () => {
    runFormatterMock.mockResolvedValue({ exitCode: 1, stdout: '' })
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
      expect.any(String),
      expect.any(Array)
    )
    expect(runFormatterMock).toHaveBeenCalledWith(
      'ktfmt',
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      expect.any(String),
      expect.any(Array)
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
      expect.any(String),
      expect.any(Array)
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
      expect.any(String),
      expect.any(Array)
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
      expect.any(String),
      expect.any(Array)
    )
  })

  it('should set files-checked output', async () => {
    readdirSyncMock.mockReturnValue([f('Main.kt'), f('Foo.kt')])
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
    runFormatterMock.mockResolvedValue({ exitCode: 1, stdout: '' })
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
    runFormatterMock.mockResolvedValue({ exitCode: 1, stdout: '' })
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
    readdirSyncMock.mockImplementation((dir: string) => {
      if (String(dir).endsWith('src')) return [f('Main.kt'), d('generated')]
      return [d('src')]
    })
    await run({ formatter: 'ktfmt', exclude: ['generated'] })
    // Only Main.kt survives — generated dir is pruned during traversal
    expect(runFormatterMock).toHaveBeenCalledWith(
      'ktfmt',
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('Main.kt')]),
      expect.any(Array),
      expect.any(String),
      expect.any(Array)
    )
    const passedFiles: string[] = runFormatterMock.mock.calls[0][2]
    expect(passedFiles.some((f: string) => f.includes('generated'))).toBe(false)
  })

  it('should skip formatter entirely when all files are excluded', async () => {
    readdirSyncMock.mockReturnValue([d('generated')])
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

  it('should pass elide flags from output_mode to runFormatter', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'file'
    })
    const passedElideFlags: string[] = runFormatterMock.mock.calls[0][5]
    expect(passedElideFlags).toEqual(['--list-files'])
  })

  it('should pass --list-diffs flag for diff output mode', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      mode: 'check',
      output_mode: 'diff'
    })
    const passedElideFlags: string[] = runFormatterMock.mock.calls[0][5]
    expect(passedElideFlags).toEqual(['--list-diffs'])
  })

  it('should pass --list-diffs=N flag when output_mode_diffs is set', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      mode: 'check',
      output_mode: 'diff',
      output_mode_diffs: 3
    })
    const passedElideFlags: string[] = runFormatterMock.mock.calls[0][5]
    expect(passedElideFlags).toEqual(['--list-diffs=3'])
  })

  it('should pass --list-files for command output mode', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'command'
    })
    const passedElideFlags: string[] = runFormatterMock.mock.calls[0][5]
    expect(passedElideFlags).toEqual(['--list-files'])
  })

  it('should pass no elide flags for none output mode', async () => {
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'none'
    })
    const passedElideFlags: string[] = runFormatterMock.mock.calls[0][5]
    expect(passedElideFlags).toEqual([])
  })

  it('should print listed files in file output mode', async () => {
    runFormatterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '/workspace/Main.kt\n/workspace/Foo.kt\n2 files checked\n'
    })
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt', 'Foo.kt'],
      output_mode: 'file',
      fail_on_error: false
    })
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining('Files affected by ktfmt')
    )
    expect(infoMock).toHaveBeenCalledWith('/workspace/Main.kt')
    expect(infoMock).toHaveBeenCalledWith('/workspace/Foo.kt')
  })

  it('should print custom command in command output mode when output_mode_command is set', async () => {
    runFormatterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '/workspace/Main.kt\n1 file checked\n'
    })
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'command',
      output_mode_command: 'make format',
      fail_on_error: false
    })
    expect(infoMock).toHaveBeenCalledWith('make format')
  })

  it('should print generated elide command in command output mode', async () => {
    runFormatterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '/workspace/Main.kt\n1 file checked\n'
    })
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'command',
      fail_on_error: false
    })
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining("elide ktfmt -- '/workspace/Main.kt'")
    )
  })

  it('should set files-failed output when output_mode is file', async () => {
    runFormatterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '/workspace/Main.kt\n/workspace/Foo.kt\n2 files checked\n'
    })
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt', 'Foo.kt'],
      output_mode: 'file',
      fail_on_error: false
    })
    expect(setOutputMock).toHaveBeenCalledWith(
      ActionOutputName.FILES_FAILED,
      '/workspace/Main.kt\n/workspace/Foo.kt'
    )
  })

  it('should set files-failed to empty string when no files fail', async () => {
    runFormatterMock.mockResolvedValue({ exitCode: 0, stdout: '' })
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'file'
    })
    expect(setOutputMock).toHaveBeenCalledWith(ActionOutputName.FILES_FAILED, '')
  })

  it('should not set files-failed when output_mode is not file', async () => {
    runFormatterMock.mockResolvedValue({
      exitCode: 1,
      stdout: '/workspace/Main.kt\n1 file checked\n'
    })
    await run({
      formatter: 'ktfmt',
      files: ['Main.kt'],
      output_mode: 'none',
      fail_on_error: false
    })
    expect(setOutputMock).not.toHaveBeenCalledWith(
      ActionOutputName.FILES_FAILED,
      expect.anything()
    )
  })
})

describe('buildElideFlags', () => {
  it('should return empty array for none mode', () => {
    const opts = buildOptions({ output_mode: 'none' })
    expect(buildElideFlags(opts)).toEqual([])
  })

  it('should return --list-files for file mode', () => {
    const opts = buildOptions({ output_mode: 'file' })
    expect(buildElideFlags(opts)).toEqual(['--list-files'])
  })

  it('should return --list-diffs for diff mode in check mode', () => {
    const opts = buildOptions({ output_mode: 'diff', mode: 'check' })
    expect(buildElideFlags(opts)).toEqual(['--list-diffs'])
  })

  it('should return --list-diffs=N when output_mode_diffs is set', () => {
    const opts = buildOptions({
      output_mode: 'diff',
      mode: 'check',
      output_mode_diffs: 5
    })
    expect(buildElideFlags(opts)).toEqual(['--list-diffs=5'])
  })

  it('should fall back to --list-files for diff mode in write mode', () => {
    const opts = buildOptions({ output_mode: 'diff', mode: 'write' })
    expect(buildElideFlags(opts)).toEqual(['--list-files'])
  })

  it('should return --list-files for command mode', () => {
    const opts = buildOptions({ output_mode: 'command' })
    expect(buildElideFlags(opts)).toEqual(['--list-files'])
  })
})

describe('parseListedFiles', () => {
  it('should parse file paths from --list-files output', () => {
    const stdout = '/workspace/Main.kt\n/workspace/Foo.kt\n2 files checked\n'
    expect(parseListedFiles(stdout)).toEqual([
      '/workspace/Main.kt',
      '/workspace/Foo.kt'
    ])
  })

  it('should return empty array when only summary line is present', () => {
    expect(parseListedFiles('0 files checked\n')).toEqual([])
  })

  it('should return empty array for empty output', () => {
    expect(parseListedFiles('')).toEqual([])
  })

  it('should strip whitespace from lines', () => {
    expect(parseListedFiles('  /a/b.kt  \n  1 file\n')).toEqual(['/a/b.kt'])
  })
})

describe('parseDiffOutput', () => {
  it('should strip the trailing summary line', () => {
    const stdout = '--- a/Main.kt\n+++ b/Main.kt\n-bad\n+good\n1 file checked'
    expect(parseDiffOutput(stdout)).toBe(
      '--- a/Main.kt\n+++ b/Main.kt\n-bad\n+good'
    )
  })

  it('should handle trailing newlines', () => {
    const stdout = '--- a/Main.kt\n+++ b/Main.kt\n1 file checked\n\n'
    expect(parseDiffOutput(stdout)).toBe('--- a/Main.kt\n+++ b/Main.kt')
  })
})

describe('printOutputModeResult', () => {
  beforeEach(() => infoMock.mockReset())

  it('should do nothing for none mode', () => {
    printOutputModeResult('none', 'ktfmt', '/workspace/Main.kt\n1 file\n', null)
    expect(infoMock).not.toHaveBeenCalled()
  })

  it('should do nothing when stdout is empty', () => {
    printOutputModeResult('file', 'ktfmt', '', null)
    expect(infoMock).not.toHaveBeenCalled()
  })

  it('should print file list for file mode', () => {
    printOutputModeResult(
      'file',
      'ktfmt',
      '/workspace/A.kt\n/workspace/B.kt\n2 files\n',
      null
    )
    expect(infoMock).toHaveBeenCalledWith('/workspace/A.kt')
    expect(infoMock).toHaveBeenCalledWith('/workspace/B.kt')
  })

  it('should print diff for diff mode', () => {
    printOutputModeResult(
      'diff',
      'ktfmt',
      '--- a/Main.kt\n+++ b/Main.kt\n1 file\n',
      null
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining('--- a/Main.kt')
    )
  })

  it('should print custom command string for command mode', () => {
    printOutputModeResult(
      'command',
      'ktfmt',
      '/workspace/Main.kt\n1 file\n',
      'make format'
    )
    expect(infoMock).toHaveBeenCalledWith('make format')
  })

  it('should generate elide command for command mode without custom command', () => {
    printOutputModeResult(
      'command',
      'ktfmt',
      '/workspace/Main.kt\n1 file\n',
      null
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining("elide ktfmt -- '/workspace/Main.kt'")
    )
  })

  it('should shell-quote paths with spaces in command mode', () => {
    printOutputModeResult(
      'command',
      'ktfmt',
      '/workspace/my project/Main.kt\n1 file\n',
      null
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining("'/workspace/my project/Main.kt'")
    )
  })

  it('should fall back to file listing for diff mode when output is not a diff', () => {
    // elide fell back to --list-files (e.g. write mode or --list-diffs=N limit exceeded)
    printOutputModeResult(
      'diff',
      'ktfmt',
      '/workspace/Main.kt\n/workspace/Foo.kt\n2 files\n',
      null
    )
    expect(infoMock).toHaveBeenCalledWith('/workspace/Main.kt')
    expect(infoMock).toHaveBeenCalledWith('/workspace/Foo.kt')
    expect(infoMock).not.toHaveBeenCalledWith(
      expect.stringContaining('Diffs for')
    )
  })

  it('should print diff content for diff mode when output is a real diff', () => {
    printOutputModeResult(
      'diff',
      'ktfmt',
      '--- a/Main.kt\n+++ b/Main.kt\n-bad\n+good\n1 file\n',
      null
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining('Diffs for ktfmt')
    )
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining('--- a/Main.kt')
    )
  })
})

describe('isDiffOutput', () => {
  it('should return true for unified diff output', () => {
    expect(
      isDiffOutput('--- a/Main.kt\n+++ b/Main.kt\n@@ -1 +1 @@\n-bad\n+good\n')
    ).toBe(true)
  })

  it('should return true when only --- is present on the first line', () => {
    expect(isDiffOutput('--- a/Main.kt\nsome content\n')).toBe(true)
  })

  it('should return true when +++ is on the second non-empty line', () => {
    expect(isDiffOutput('--- a/Main.kt\n+++ b/Main.kt\n')).toBe(true)
  })

  it('should return true when @@ is on the third non-empty line', () => {
    expect(isDiffOutput('--- a\n+++ b\n@@ -1 +1 @@\n')).toBe(true)
  })

  it('should return false for file-listing output', () => {
    expect(isDiffOutput('/workspace/Main.kt\n/workspace/Foo.kt\n2 files\n')).toBe(
      false
    )
  })

  it('should return false for empty string', () => {
    expect(isDiffOutput('')).toBe(false)
  })
})
