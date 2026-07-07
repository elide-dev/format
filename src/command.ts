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

export const WRITE_FLAGS: Record<FormatterName, string[]> = {
  javaformat: ['-r'],
  ktfmt: []
}

export function buildFormatterArgs(
  formatter: FormatterName,
  mode: FormatMode,
  files: string[],
  extraArgs: string[],
  elideFlags: string[] = []
): string[] {
  return [
    formatter,
    ...elideFlags,
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
  cwd: string,
  elideFlags: string[] = []
): Promise<{ exitCode: number; stdout: string }> {
  const tempDir = process.env.RUNNER_TEMP ?? os.tmpdir()
  const argfilePath = path.join(tempDir, `format-${formatter}.txt`)

  writeFileSync(argfilePath, files.join('\n'), 'utf-8')
  const execArgs = buildFormatterArgs(
    formatter,
    mode,
    [`@${argfilePath}`],
    extraArgs,
    elideFlags
  )

  let capturedStdout = ''
  const listeners =
    elideFlags.length > 0
      ? {
          stdout: (data: Buffer) => {
            capturedStdout += data.toString()
          }
        }
      : undefined

  core.debug(`Running: elide ${formatter} on ${files.length} files`)
  try {
    const exitCode = await exec.exec('elide', execArgs, {
      cwd,
      ignoreReturnCode: true,
      listeners
    })
    return { exitCode, stdout: capturedStdout }
  } finally {
    try {
      unlinkSync(argfilePath)
    } catch {}
  }
}
