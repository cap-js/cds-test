#!/usr/bin/env node
/* eslint-disable no-console */

const options = {
  'timeout':  { type:'string',  short:'t' },
  'verbose':  { type:'boolean', short:'v' },
  'unmute':   { type:'boolean', short:'u' },
  'silent':   { type:'boolean', short:'s' },
  'quiet':    { type:'boolean', short:'q' },
  'list':     { type:'boolean', short:'l' },
  'recent':   { type:'boolean' },
  'passed':   { type:'boolean' },
  'failed':   { type:'boolean' },
  'match':    { type:'string', default: '(.test.js|.spec.js)$' },
  'skip':     { type:'string', default: '^(gen,*.tmp)$' },
  'only':     { type:'string'},
  'help':     { type:'boolean', short:'h' },
  'workers':  { type:'string', short:'w' },
}

const USAGE = `
Usage:

  cds test [ options ] [ patterns ]

Options:

  -l, --list     List found test files
  -q, --quiet    No output at all
  -s, --silent   No output
  -t, --timeout  in milliseconds
  -u, --unmute   Unmute output
  -v, --verbose  Increase verbosity
  -w, --workers  Specify number of workers
  -?, --help     Displays this usage info

  --match        Pick matching files, default: ${options.match.default}
  --skip         Skip matching files, default: ${options.skip.default}
  --only         Run only the matching tests
  --failed       Repeat recently failed test suite(s)
  --passed       Repeat recently passed test suite(s)
  --recent       Repeat recently run test suite(s)
`

const { DIMMED, YELLOW, GRAY, RESET } = require('./colors')
const regex4 = s => !s ? null : RegExp (s.replace(/[,.*]/g, s => ({ ',': '|', '.': '\\.', '*': '.*' })[s]))
const recent = () => {try { return require(home+'/.cds-test-recent.json') } catch {/* egal */}}
const os = require('os'), home = os.userInfo().homedir

async function test (argv,o) {
  if (o.help || argv == '?') return console.log (USAGE)
  if (o.recent) o = { ...o, ...recent().options }
  if (o.passed) o.files = recent().passed
  if (o.failed) o.files = recent().failed
  if (!o.files) o.files = await fetch (argv,o)
  if (o.list) return list (o.files)
  if (o.skip) process.env._chest_skip = o.skip
  if (o.files.length > 1) console.log (DIMMED,`\nRunning ${o.files.length} test suites...`, RESET)
  const test = require('node:test').run({ ...o,
    execArgv: [ '--require', require.resolve('../lib/fixtures/node-test.js') ],
    timeout: +o.timeout || undefined,
    concurrency: +o.workers || true,
    testNamePatterns: regex4 (o.only), only: false,
  })
  require('./reporter')(test, test.options = o)
}

async function fetch (argv,o) {
  const patterns = regex4 (argv.join('|')) || { test: ()=> true }
  const tests = regex4 (o.match || options.match.default) || { test: ()=> true }
  const skip = regex4 (o.skip || options.skip.default) || { test: ()=> false }
  const ignore = /^(\..*|node_modules|_out)$/
  const files = []
  const fs = require('node:fs'), path = require('node:path')
  const _read = fs.promises.readdir
  const _isdir = x => fs.statSync(x).isDirectory()
  await async function _visit (dir) {
    const entries = await _read (dir)
    return Promise.all (entries.map (each => {
      if (ignore.test(each) || skip.test(each = path.join (dir,each))) return
      if (tests.test(each)) return patterns.test(each) && files.push(each)
      if (_isdir(each)) return _visit (each)
    }))
  } (process.cwd())
  if (!files.length) throw YELLOW+`\n No matching test files found. \n`+RESET
  return files
}

function list (files) {
  const { relative } = require('node:path'), cwd = process.cwd()
  const time = (performance.now() / 1000).toFixed(3)
  console.log()
  console.log(`Found these matching test files:`, DIMMED, '\n')
  for (let f of files) console.log('  ', relative(cwd, f))
  console.log(RESET+'\n', files.length, 'total')
  console.log(GRAY, time+'s', RESET, '\n')
}


if (!module.parent) {
  const { positionals, values } = require('node:util').parseArgs ({ options, allowPositionals: true })
  test (positionals, values) .catch (e => console.error(e), process.exitCode = 1)
}

else module.exports = Object.assign ( test, {
  options: [
    '--files',
    '--match',
    '--skip',
    '--timeout',
    '--workers',
  ],
  flags: [
    '--verbose',
    '--unmute',
    '--silent',
    '--quiet',
    '--list',
    '--recent',
    '--passed',
    '--failed',
  ],
  shortcuts: [ '-f', null, null, '-t', '-w', '-v', '-u', '-s', '-q', '-l' ],
  help: USAGE
})
