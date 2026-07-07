#!/usr/bin/env node
// Generates src/vendor/syntax.js — a self-contained bundle of the `syntax`
// package with its external deps (tokenizr, sax) inlined as Browserify module
// entries. This avoids the runtime require("tokenizr") that fails on GitHub
// runners where node_modules is absent.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nm = resolve(root, 'node_modules')

const syntaxSrc = readFileSync(resolve(nm, 'syntax/lib/syntax.node.js'), 'utf8')
const tokenizrSrc = readFileSync(resolve(nm, 'tokenizr/lib/tokenizr.js'), 'utf8')
const saxSrc = readFileSync(resolve(nm, 'sax/lib/sax.js'), 'utf8')

// The syntax Browserify bundle ends with:
//   ..."sax":"sax","tokenizr":"tokenizr"}]},{},[4])(4)\n});\n
//
// We insert two extra module entries ("sax" and "tokenizr") right before the
// closing `}` of the top-level modules map so the Browserify runtime finds them
// in its registry and never falls through to the external require().
const INJECT_MARKER = '},{},[4])(4)'
const markerIdx = syntaxSrc.lastIndexOf(INJECT_MARKER)
if (markerIdx === -1) throw new Error('Could not find Browserify module map end in syntax.node.js')

const before = syntaxSrc.slice(0, markerIdx)
const after = syntaxSrc.slice(markerIdx)

// Wrap each dep's source as a Browserify module factory.
// Both tokenizr and sax are self-contained UMD/Browserify bundles that write
// to module.exports, so we just execute them inside the factory.
function makeEntry(src) {
  return `[function(require,module,exports){\n${src}\n},{}]`
}

const patched =
  before +
  `,"sax":${makeEntry(saxSrc)}` +
  `,"tokenizr":${makeEntry(tokenizrSrc)}` +
  after

mkdirSync(resolve(root, 'src/vendor'), { recursive: true })
writeFileSync(resolve(root, 'src/vendor/syntax.cjs'), patched, 'utf8')
console.log('Wrote src/vendor/syntax.cjs')
