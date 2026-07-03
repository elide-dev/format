import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { writeFileSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FormatMode } from './options'

export type FormatterName = 'javaformat' | 'ktfmt'

const CHECK_FLAGS: Record<FormatterName, string[]> = {
  javaformat: ['--dry-run', '--set-exit-if-changed'],
  ktfmt: ['--dry-run', '--set-exit-if-changed']
}

export function buildFormatterArgs(
  formatter: FormatterName,
  mode: FormatMode,
  files: string[],
  extraArgs: string[]
): string[] {
  return [
    formatter,
    '--',
    ...(mode === 'check' ? CHECK_FLAGS[formatter] : []),
    ...extraArgs,
    ...files
  ]
}

export async function runFormatter(
  formatter: FormatterName,
  mode: FormatMode,
  files: string[],
  extraArgs: string[],
  cwd: string
): Promise<number> {
  const tempDir = process.env.RUNNER_TEMP ?? os.tmpdir()
  const argfilePath = path.join(tempDir, `format-${formatter}.txt`)

  let execArgs: string[]
  if (formatter === 'ktfmt') {
    // ktfmt requires the argfile to be the only argument after `--`, so flags go in the file
    const checkFlags = mode === 'check' ? CHECK_FLAGS.ktfmt : []
    writeFileSync(
      argfilePath,
      [...checkFlags, ...extraArgs, ...files].join('\n'),
      'utf-8'
    )
    execArgs = [formatter, '--', `@${argfilePath}`]
  } else {
    writeFileSync(argfilePath, files.join('\n'), 'utf-8')
    execArgs = buildFormatterArgs(
      formatter,
      mode,
      [`@${argfilePath}`],
      extraArgs
    )
  }

  core.debug(`Running: elide ${formatter} on ${files.length} files`)
  try {
    return await exec.exec('elide', execArgs, { cwd, ignoreReturnCode: true })
  } finally {
    try {
      unlinkSync(argfilePath)
    } catch {}
  }
}
