import { describe, it, expect, beforeEach, jest, mock } from 'bun:test'

const getInputMock = jest.fn().mockReturnValue('')
const getBooleanInputMock = jest.fn().mockReturnValue(true)

mock.module('@actions/core', () => ({
  getInput: getInputMock,
  getBooleanInput: getBooleanInputMock,
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn()
}))

import buildOptions, {
  normalizeFormatter,
  normalizeMode,
  normalizeOutputMode,
  parseArgs,
  parseFiles,
  buildOptionsFromInputs,
  OptionName
} from '../src/options'

describe('normalizeFormatter', () => {
  it('should recognize javaformat', () => {
    expect(normalizeFormatter('javaformat')).toBe('javaformat')
    expect(normalizeFormatter('JAVAFORMAT')).toBe('javaformat')
  })
  it('should accept google-java-format as alias', () => {
    expect(normalizeFormatter('google-java-format')).toBe('javaformat')
    expect(normalizeFormatter('GOOGLE-JAVA-FORMAT')).toBe('javaformat')
  })
  it('should accept gjf as alias', () => {
    expect(normalizeFormatter('gjf')).toBe('javaformat')
    expect(normalizeFormatter('GJF')).toBe('javaformat')
  })
  it('should recognize ktfmt', () => {
    expect(normalizeFormatter('ktfmt')).toBe('ktfmt')
    expect(normalizeFormatter('KTFMT')).toBe('ktfmt')
  })
  it('should default unknown values to all', () => {
    expect(normalizeFormatter('all')).toBe('all')
    expect(normalizeFormatter('')).toBe('all')
    expect(normalizeFormatter('unknown')).toBe('all')
  })
})

describe('normalizeMode', () => {
  it('should recognize write mode', () => {
    expect(normalizeMode('write')).toBe('write')
    expect(normalizeMode('WRITE')).toBe('write')
  })
  it('should accept format as alias for write', () => {
    expect(normalizeMode('format')).toBe('write')
    expect(normalizeMode('FORMAT')).toBe('write')
  })
  it('should default to check mode', () => {
    expect(normalizeMode('check')).toBe('check')
    expect(normalizeMode('')).toBe('check')
    expect(normalizeMode('unknown')).toBe('check')
  })
})

describe('normalizeOutputMode', () => {
  it('should recognize file mode', () => {
    expect(normalizeOutputMode('file')).toBe('file')
    expect(normalizeOutputMode('FILE')).toBe('file')
  })
  it('should recognize diff mode', () => {
    expect(normalizeOutputMode('diff')).toBe('diff')
    expect(normalizeOutputMode('DIFF')).toBe('diff')
  })
  it('should recognize command mode', () => {
    expect(normalizeOutputMode('command')).toBe('command')
    expect(normalizeOutputMode('COMMAND')).toBe('command')
  })
  it('should default unknown values to none', () => {
    expect(normalizeOutputMode('none')).toBe('none')
    expect(normalizeOutputMode('')).toBe('none')
    expect(normalizeOutputMode('unknown')).toBe('none')
  })
})

describe('parseArgs', () => {
  it('should split by whitespace', () => {
    expect(parseArgs('--aosp --style=google')).toEqual([
      '--aosp',
      '--style=google'
    ])
  })
  it('should handle single arg', () => {
    expect(parseArgs('--aosp')).toEqual(['--aosp'])
  })
  it('should return empty array for blank input', () => {
    expect(parseArgs('')).toEqual([])
    expect(parseArgs('  ')).toEqual([])
  })
})

describe('parseFiles', () => {
  it('should split by spaces', () => {
    expect(parseFiles('Foo.java Bar.java')).toEqual(['Foo.java', 'Bar.java'])
  })
  it('should split by newlines', () => {
    expect(parseFiles('Foo.java\nBar.java')).toEqual(['Foo.java', 'Bar.java'])
  })
  it('should return empty array for blank input', () => {
    expect(parseFiles('')).toEqual([])
    expect(parseFiles('  ')).toEqual([])
  })
})

describe('buildOptions', () => {
  it('should apply sensible defaults', () => {
    const opts = buildOptions()
    expect(opts.formatter).toBe('all')
    expect(opts.mode).toBe('check')
    expect(opts.files).toEqual([])
    expect(opts.gjf_args).toEqual([])
    expect(opts.ktfmt_args).toEqual([])
    expect(opts.fail_on_error).toBe(true)
    expect(opts.telemetry).toBe(true)
    expect(opts.working_directory).toBeTruthy()
    expect(opts.output_mode).toBe('none')
    expect(opts.output_mode_diffs).toBeNull()
    expect(opts.output_mode_command).toBeNull()
  })
  it('should allow overriding output_mode', () => {
    expect(buildOptions({ output_mode: 'file' }).output_mode).toBe('file')
    expect(buildOptions({ output_mode: 'diff' }).output_mode).toBe('diff')
    expect(buildOptions({ output_mode: 'command' }).output_mode).toBe('command')
  })
  it('should allow setting output_mode_diffs', () => {
    expect(buildOptions({ output_mode_diffs: 5 }).output_mode_diffs).toBe(5)
  })
  it('should allow setting output_mode_command', () => {
    expect(
      buildOptions({ output_mode_command: 'make fmt' }).output_mode_command
    ).toBe('make fmt')
  })
  it('should allow overriding formatter', () => {
    expect(buildOptions({ formatter: 'ktfmt' }).formatter).toBe('ktfmt')
    expect(buildOptions({ formatter: 'javaformat' }).formatter).toBe(
      'javaformat'
    )
  })
  it('should allow overriding mode', () => {
    expect(buildOptions({ mode: 'write' }).mode).toBe('write')
  })
  it('should allow overriding files and args', () => {
    const opts = buildOptions({
      files: ['Foo.java'],
      gjf_args: ['--aosp'],
      ktfmt_args: ['--google-style']
    })
    expect(opts.files).toEqual(['Foo.java'])
    expect(opts.gjf_args).toEqual(['--aosp'])
    expect(opts.ktfmt_args).toEqual(['--google-style'])
  })
  it('should allow disabling fail_on_error', () => {
    expect(buildOptions({ fail_on_error: false }).fail_on_error).toBe(false)
  })
  it('should allow disabling telemetry', () => {
    expect(buildOptions({ telemetry: false }).telemetry).toBe(false)
  })
  it('should default include_kts to false', () => {
    expect(buildOptions().include_kts).toBe(false)
  })
  it('should allow enabling include_kts', () => {
    expect(buildOptions({ include_kts: true }).include_kts).toBe(true)
  })
})

describe('buildOptionsFromInputs', () => {
  beforeEach(() => {
    getInputMock.mockReturnValue('')
    getBooleanInputMock.mockReturnValue(true)
  })

  it('should read formatter input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.FORMATTER ? 'ktfmt' : ''
    )
    expect(buildOptionsFromInputs().formatter).toBe('ktfmt')
  })

  it('should read mode input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.MODE ? 'write' : ''
    )
    expect(buildOptionsFromInputs().mode).toBe('write')
  })

  it('should read and parse files input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.FILES ? 'Foo.java Bar.java' : ''
    )
    expect(buildOptionsFromInputs().files).toEqual(['Foo.java', 'Bar.java'])
  })

  it('should read and parse gjf-args input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.GJF_ARGS ? '--aosp --style=google' : ''
    )
    expect(buildOptionsFromInputs().gjf_args).toEqual([
      '--aosp',
      '--style=google'
    ])
  })

  it('should read and parse ktfmt-args input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.KTFMT_ARGS ? '--google-style' : ''
    )
    expect(buildOptionsFromInputs().ktfmt_args).toEqual(['--google-style'])
  })

  it('should read and parse exclude input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.EXCLUDE ? 'generated proto' : ''
    )
    expect(buildOptionsFromInputs().exclude).toEqual(['generated', 'proto'])
  })

  it('should read include-kts input', () => {
    getBooleanInputMock.mockImplementation((name: string) =>
      name === OptionName.INCLUDE_KTS ? true : true
    )
    expect(buildOptionsFromInputs().include_kts).toBe(true)
  })

  it('should fall back to default when getBooleanInput throws', () => {
    getBooleanInputMock.mockImplementation(() => {
      throw new Error('not a boolean')
    })
    const opts = buildOptionsFromInputs()
    expect(opts.fail_on_error).toBe(true)
    expect(opts.telemetry).toBe(true)
    expect(opts.include_kts).toBe(false)
  })

  it('should apply defaults when inputs are empty', () => {
    getBooleanInputMock.mockReturnValue(false)
    const opts = buildOptionsFromInputs()
    expect(opts.formatter).toBe('all')
    expect(opts.mode).toBe('check')
    expect(opts.files).toEqual([])
    expect(opts.exclude).toEqual([])
    expect(opts.include_kts).toBe(false)
    expect(opts.output_mode).toBe('none')
    expect(opts.output_mode_diffs).toBeNull()
    expect(opts.output_mode_command).toBeNull()
  })

  it('should read output-mode input', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.OUTPUT_MODE ? 'file' : ''
    )
    expect(buildOptionsFromInputs().output_mode).toBe('file')
  })

  it('should read output-mode-diffs as integer', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.OUTPUT_MODE_DIFFS ? '3' : ''
    )
    expect(buildOptionsFromInputs().output_mode_diffs).toBe(3)
  })

  it('should throw for invalid output-mode-diffs', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.OUTPUT_MODE_DIFFS ? 'not-a-number' : ''
    )
    expect(() => buildOptionsFromInputs()).toThrow(
      "invalid value for 'output-mode-diffs'"
    )
  })

  it('should throw for non-positive output-mode-diffs', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.OUTPUT_MODE_DIFFS ? '0' : ''
    )
    expect(() => buildOptionsFromInputs()).toThrow(
      "invalid value for 'output-mode-diffs'"
    )
  })

  it('should read output-mode-command as string', () => {
    getInputMock.mockImplementation((name: string) =>
      name === OptionName.OUTPUT_MODE_COMMAND ? 'make format' : ''
    )
    expect(buildOptionsFromInputs().output_mode_command).toBe('make format')
  })
})
