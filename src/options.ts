import * as core from '@actions/core'

export enum OptionName {
  FORMATTER = 'formatter',
  MODE = 'mode',
  FILES = 'files',
  EXCLUDE = 'exclude',
  WORKING_DIRECTORY = 'working-directory',
  GJF_ARGS = 'gjf-args',
  KTFMT_ARGS = 'ktfmt-args',
  INCLUDE_KTS = 'include-kts',
  FAIL_ON_ERROR = 'fail-on-error',
  TELEMETRY = 'telemetry'
}

export type FormatterChoice = 'javaformat' | 'ktfmt' | 'all'
export type FormatMode = 'check' | 'write'

export interface ElideFormatActionOptions {
  formatter: FormatterChoice
  mode: FormatMode
  // Empty array means no explicit files — scan by extension.
  files: string[]
  // Paths or glob patterns to exclude from formatting.
  exclude: string[]
  working_directory: string
  gjf_args: string[]
  ktfmt_args: string[]
  include_kts: boolean
  fail_on_error: boolean
  telemetry: boolean
}

export const defaults: ElideFormatActionOptions = {
  formatter: 'all',
  mode: 'check',
  files: [],
  exclude: [],
  working_directory: process.env.GITHUB_WORKSPACE ?? process.cwd(),
  gjf_args: [],
  ktfmt_args: [],
  include_kts: false,
  fail_on_error: true,
  telemetry: true
}

export function normalizeFormatter(value: string): FormatterChoice {
  switch (value.trim().toLowerCase()) {
    case 'google-java-format':
    case 'javaformat':
    case 'gjf':
      return 'javaformat'
    case 'ktfmt':
      return 'ktfmt'
    default:
      return 'all'
  }
}

export function normalizeMode(value: string): FormatMode {
  switch (value.trim().toLowerCase()) {
    case 'write':
    case 'format':
      return 'write'
    default:
      return 'check'
  }
}

export function parseArgs(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean)
}

export function parseFiles(value: string): string[] {
  return value
    .trim()
    .split(/[\s\n]+/)
    .filter(Boolean)
}

export default function buildOptions(
  opts?: Partial<ElideFormatActionOptions>
): ElideFormatActionOptions {
  return { ...defaults, ...opts }
}

function booleanInput(name: string, defaultValue: boolean): boolean {
  try {
    return core.getBooleanInput(name)
  } catch {
    return defaultValue
  }
}

function stringInput(name: string, defaultValue?: string): string | undefined {
  const value = core.getInput(name)
  return value || defaultValue || undefined
}

export function buildOptionsFromInputs(): ElideFormatActionOptions {
  return buildOptions({
    formatter: normalizeFormatter(
      stringInput(OptionName.FORMATTER, 'all') as string
    ),
    mode: normalizeMode(stringInput(OptionName.MODE, 'check') as string),
    files: parseFiles(stringInput(OptionName.FILES, '') ?? ''),
    exclude: parseFiles(stringInput(OptionName.EXCLUDE, '') ?? ''),
    working_directory: stringInput(
      OptionName.WORKING_DIRECTORY,
      defaults.working_directory
    ) as string,
    gjf_args: parseArgs(stringInput(OptionName.GJF_ARGS, '') ?? ''),
    ktfmt_args: parseArgs(stringInput(OptionName.KTFMT_ARGS, '') ?? ''),
    include_kts: booleanInput(OptionName.INCLUDE_KTS, false),
    fail_on_error: booleanInput(OptionName.FAIL_ON_ERROR, true),
    telemetry: booleanInput(OptionName.TELEMETRY, true)
  })
}
