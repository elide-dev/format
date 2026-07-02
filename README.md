
# GitHub Action: Elide Format

[![Elide](https://elide.dev/shield)](https://elide.dev)
[![CI](https://github.com/elide-dev/format/actions/workflows/ci.yml/badge.svg)](https://github.com/elide-dev/format/actions)
[![codecov](https://codecov.io/gh/elide-dev/format/graph/badge.svg)](https://codecov.io/gh/elide-dev/format)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4-ff69b4.svg)](.github/CODE_OF_CONDUCT.md)

This repository provides a [GitHub Action][0] to check source formatting using [Elide][1]'s bundled formatters: [google-java-format][5] for Java and [ktfmt][6] for Kotlin.

## Quick Start

```yaml
- name: "Setup: Elide"
  uses: elide-dev/setup-elide

- name: "Format: Check"
  uses: elide-dev/format
```

This checks all `.java` and `.kt` files in the repository for correct formatting and fails the workflow if any files are not formatted.

## Usage Examples

**Check only Java files**
```yaml
- uses: elide-dev/format
  with:
    formatter: javaformat
```

**Check only Kotlin files (including scripts)**
```yaml
- uses: elide-dev/format
  with:
    formatter: ktfmt
    include-kts: true
```

**Check specific files or directories**
```yaml
- uses: elide-dev/format
  with:
    files: |
      src/main/java
      src/test/java/com/example/MyTest.java
```

**Exclude generated or vendored sources**
```yaml
- uses: elide-dev/format
  with:
    exclude: generated proto vendor
```

**Reformat instead of checking**
```yaml
- uses: elide-dev/format
  with:
    mode: write
```

**Warn on failure instead of failing the workflow**
```yaml
- uses: elide-dev/format
  with:
    fail-on-error: false
```

**Pass extra arguments to the formatters**
```yaml
- uses: elide-dev/format
  with:
    formatter: ktfmt
    ktfmt-args: --google-style
```

**Use outputs in subsequent steps**
```yaml
- name: "Format: Check"
  id: format
  uses: elide-dev/format

- name: "Report"
  run: |
    echo "Result: ${{ steps.format.outputs.result }}"
    echo "Files checked: ${{ steps.format.outputs.files-checked }}"
```

## Inputs

| Input               | Type      | Default                   | Description                                                                                                                      |
|---------------------|-----------|---------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| `formatter`         | `string`  | `all`                     | Formatter to run: `javaformat`, `ktfmt`, or `all`                                                                                |
| `mode`              | `string`  | `check`                   | Run mode: `check` (fail if unformatted) or `write` (reformat in place)                                                           |
| `files`             | `string`  |                           | Files or directories to check (space or newline-separated). When omitted, sources are auto-detected by extension.                |
| `exclude`           | `string`  |                           | Files or patterns to exclude (space or newline-separated). Plain names match as path segments; `*` and `**` globs are supported. |
| `working-directory` | `string`  | `${{ github.workspace }}` | Directory to run formatters from                                                                                                 |
| `gjf-args`          | `string`  |                           | Extra arguments for google-java-format (appended after `--`)                                                                     |
| `ktfmt-args`        | `string`  |                           | Extra arguments for ktfmt (appended after `--`)                                                                                  |
| `include-kts`       | `boolean` | `false`                   | Include `.kts` (Kotlin script) files when running ktfmt                                                                          |
| `fail-on-error`     | `boolean` | `true`                    | Fail the workflow when formatting check fails                                                                                    |
| `telemetry`         | `boolean` | `true`                    | Enable anonymous error telemetry ([details](#telemetry))                                                                         |

## Outputs

| Output          | Description                          |
|-----------------|--------------------------------------|
| `result`        | Check result: `success` or `failure` |
| `files-checked` | Number of files checked              |

## File Discovery

When `files` is not set, the action scans `working-directory` recursively for source files by extension (`.java` for `javaformat`, `.kt` and optionally `.kts` for `ktfmt`). The following directories are always skipped during scanning: `node_modules`, `.git`, `build`, `dist`, `target`, `.gradle`, `.idea`, `out`.

When `files` is provided, each entry can be an individual file or a directory. Directories are expanded recursively using the same extension filter. The `exclude` patterns are applied after all file resolution.

## Telemetry

This action sends anonymous error telemetry to help the Elide team detect and fix issues at scale. **No secrets, tokens, environment variables, or personally identifiable information are ever transmitted.** Only the error message (scrubbed of sensitive values), stack trace, and action configuration (formatter, mode) are sent.

To opt out:
```yaml
- uses: elide-dev/format
  with:
    telemetry: false
```

## GitHub Integration

This action uses GitHub Actions features to provide a polished CI experience:

- **Grouped log output** -- Formatter invocations are wrapped in collapsible log groups
- **Job summary** -- A summary table is written to the Actions Summary tab showing formatter results, file count, and timing
- **Annotations** -- Errors appear as titled annotations in the Actions UI
- **Rich outputs** -- Downstream steps can branch on `result` and `files-checked`

## What is Elide?

Elide is a new runtime and framework designed for the polyglot era. Mix and match languages including JavaScript, Python, Ruby, and JVM, with the ability to share objects between them. It's fast: Elide can execute Python at up to 3x the speed of CPython, Ruby at up to 22x vs. CRuby, and JavaScript at up to 75x the speed of Node.

- **Visit [elide.dev][1]**, our website, which runs on Elide
- **Watch the [launch video][2]** for demos, benchmarks, and a full feature tour
- **Join the devs on [Discord][3]**, we are always open to new ideas and feedback

## License

[MIT](.github/LICENSE)

[0]: https://github.com/features/actions
[1]: https://elide.dev
[2]: https://www.youtube.com/watch?v=Txl9ryfbCw4
[3]: https://elide.dev/discord
[5]: https://github.com/google/google-java-format
[6]: https://github.com/facebook/ktfmt
