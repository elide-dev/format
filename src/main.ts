import * as core from '@actions/core'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import buildOptions, {
  buildOptionsFromInputs,
  type ElideFormatActionOptions
} from './options'
import { runFormatter, type FormatterName } from './command'
import {
  initTelemetry,
  reportError,
  flushTelemetry,
  withSpan,
  recordMetric,
  logEvent
} from './telemetry'

export enum ActionOutputName {
  RESULT = 'result',
  FILES_CHECKED = 'files-checked'
}

export function findFiles(
  dir: string,
  ext: string,
  excludePatterns: string[] = []
): string[] {
  const results: string[] = []
  function walk(current: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!excludePatterns.some(p => matchesExcludePattern(full, p))) {
          walk(full)
        }
      } else if (entry.name.endsWith(ext)) {
        results.push(full)
      }
    }
  }
  walk(dir)
  return results
}

function getExtensions(
  formatter: FormatterName,
  options: ElideFormatActionOptions
): string[] {
  if (formatter === 'javaformat') return ['.java']
  return options.include_kts ? ['.kt', '.kts'] : ['.kt']
}

export function resolveFiles(
  options: ElideFormatActionOptions,
  formatter: FormatterName
): string[] {
  const exts = getExtensions(formatter, options)

  if (options.files.length > 0) {
    return options.files.flatMap(f => {
      const resolved = path.isAbsolute(f)
        ? f
        : path.join(options.working_directory, f)
      try {
        if (statSync(resolved).isDirectory()) {
          return exts.flatMap(ext => findFiles(resolved, ext, options.exclude))
        }
      } catch {
        // not a directory or path doesn't exist — treat as a file path
      }
      return [resolved]
    })
  }

  return exts.flatMap(ext =>
    findFiles(options.working_directory, ext, options.exclude)
  )
}

/**
 * Returns true if the normalized file path matches the exclusion pattern.
 *
 * Plain patterns (no * or ?) match as path segments — "generated" excludes any
 * file under a directory named "generated". Glob patterns use * (within a
 * segment) and ** (across segments).
 */
export function matchesExcludePattern(
  filePath: string,
  pattern: string
): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  const normPattern = pattern.replace(/\\/g, '/')

  if (!normPattern.includes('*') && !normPattern.includes('?')) {
    return (
      normalized === normPattern ||
      normalized.startsWith(normPattern + '/') ||
      normalized.includes('/' + normPattern + '/') ||
      normalized.endsWith('/' + normPattern)
    )
  }

  const regexStr =
    '^' +
    normPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, ' ')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/ /g, '.*') +
    '$'

  return new RegExp(regexStr).test(normalized)
}

export function applyExclusions(files: string[], patterns: string[]): string[] {
  if (patterns.length === 0) return files
  return files.filter(f => !patterns.some(p => matchesExcludePattern(f, p)))
}

async function writeSummary(
  formatters: FormatterName[],
  results: Record<FormatterName, number>,
  filesChecked: number,
  success: boolean,
  elapsedMs: number
): Promise<void> {
  try {
    const elapsed =
      elapsedMs < 1000
        ? `${Math.round(elapsedMs)}ms`
        : `${(elapsedMs / 1000).toFixed(1)}s`

    const rows: { data: string; header: boolean }[][] = formatters.map(f => [
      { data: f, header: false },
      { data: results[f] === 0 ? 'passed' : 'failed', header: false }
    ])

    await core.summary
      .addHeading(success ? 'Format Check Passed' : 'Format Check Failed', 2)
      .addTable([
        [
          { data: 'Formatter', header: true },
          { data: 'Result', header: true }
        ],
        ...rows,
        [
          { data: 'Files checked', header: true },
          { data: String(filesChecked), header: false }
        ],
        [
          { data: 'Time', header: true },
          { data: elapsed, header: false }
        ]
      ])
      .write()
  } catch {
    // ignore — summary is not available outside GHA
  }
}

export async function run(
  options?: Partial<ElideFormatActionOptions>
): Promise<void> {
  const startTime = Date.now()

  try {
    const effectiveOptions = await core.group('Resolving options', async () => {
      const opts = options ? buildOptions(options) : buildOptionsFromInputs()
      core.info(
        `formatter=${opts.formatter} mode=${opts.mode} working_directory=${opts.working_directory}`
      )
      return opts
    })

    initTelemetry(effectiveOptions.telemetry, effectiveOptions)
    logEvent('format.start', {
      formatter: effectiveOptions.formatter,
      mode: effectiveOptions.mode
    })

    await withSpan('format', 'format', async () => {
      const formatters: FormatterName[] =
        effectiveOptions.formatter === 'all'
          ? ['javaformat', 'ktfmt']
          : [effectiveOptions.formatter]

      const results: Partial<Record<FormatterName, number>> = {}
      let totalFiles = 0

      for (const formatter of formatters) {
        const resolved = resolveFiles(effectiveOptions, formatter)
        const files = applyExclusions(resolved, effectiveOptions.exclude)
        totalFiles += files.length

        if (files.length === 0) {
          const ext = formatter === 'javaformat' ? '.java' : '.kt'
          core.info(`No ${ext} files found, skipping ${formatter}`)
          results[formatter] = 0
          continue
        }

        const extraArgs =
          formatter === 'javaformat'
            ? effectiveOptions.gjf_args
            : effectiveOptions.ktfmt_args

        const exitCode: number = await core.group(
          `Running ${formatter}`,
          async () =>
            withSpan(`format.${formatter}`, 'format', () =>
              runFormatter(
                formatter,
                effectiveOptions.mode,
                files,
                extraArgs,
                effectiveOptions.working_directory
              )
            )
        )

        results[formatter] = exitCode

        if (exitCode !== 0) {
          core.error(`${formatter} check failed (exit code ${exitCode})`, {
            title: 'Format Check Failed'
          })
        } else {
          core.info(`${formatter} check passed`)
        }
      }

      const success = Object.values(results).every(code => code === 0)
      const elapsed = Date.now() - startTime

      core.setOutput(ActionOutputName.RESULT, success ? 'success' : 'failure')
      core.setOutput(ActionOutputName.FILES_CHECKED, String(totalFiles))

      recordMetric('format.duration_ms', elapsed, 'millisecond', {
        formatter: effectiveOptions.formatter,
        mode: effectiveOptions.mode
      })

      logEvent('format.exit', {
        status: success ? 'success' : 'failure',
        formatter: effectiveOptions.formatter,
        mode: effectiveOptions.mode
      })

      await writeSummary(
        formatters,
        results as Record<FormatterName, number>,
        totalFiles,
        success,
        elapsed
      )

      if (!success) {
        const failed = Object.entries(results)
          .filter(([, code]) => code !== 0)
          .map(([f]) => `elide ${f}`)
          .join(', ')
        const message = `Format check failed. Run locally to fix: ${failed}`

        if (effectiveOptions.fail_on_error) {
          core.setFailed(message)
        } else {
          core.warning(message, { title: 'Format Check Failed' })
        }
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      reportError(error)
      core.error(error.message, { title: 'Action Failed' })
      core.setFailed(error.message)
    }
  } finally {
    await flushTelemetry()
  }
}
