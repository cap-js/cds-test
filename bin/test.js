#!/usr/bin/env node

module.exports = Object.assign ( test, {
  options: [
    '--files',
    '--include',
    '--exclude',
    '--pattern',
    '--skip',
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
  shortcuts: [ '-f', '-i', '-x', '-p', null, '-v', '-u', '-s', '-q', '-l' ],
  help: `
`})


/* eslint-disable no-console */
const { DIMMED, RESET } = require('@sap/cds').utils.colors

async function test (argv,o) {
  if (process.platform === 'win32') throw `This runner is not supported on Windows`

  const _recent = require('os').userInfo().homedir + '/.cds-test-recent.json'
  const recent = require('fs').existsSync(_recent) ? require(_recent) : {}
  if (!o.recent) {
    o.files = await find (argv, o, recent)
  } else {
    Object.assign (o,recent.options)
    console.log ('\nchest',...o.argv)
  }
  if (o.list) return list (o.files)
  if (o.skip) process.env._chest_skip = o.skip
  if (o.files.length > 1) console.log(DIMMED,`\nRunning ${o.files.length} test suite${o.files.length > 1 ? 's' : ''}...`, RESET)
  const test = require('node:test').run({ ...o, concurrency:true })
  require('../lib/reporter')(test, test.options = o)
}


async function find (argv,o,recent) {

  // pre-process options
  const { pattern = '.spec.js,.test.js', include, exclude = '_out' } = o,
    patterns = pattern?.split(',') || [],
    includes = include?.split(',') || [],
    excludes = exclude?.split(',') || []

  // return recent results if --passed or --failed is used
  if (o.passed) return recent.passed
  if (o.failed) return recent.failed

  // check if argv is a list of files or directories
  const {lstat} = require('fs').promises, files=[], roots=[]
  await Promise.all (argv.map (async x => {
    let ls = await lstat(x).catch(()=>{})
    if (!ls) return includes.push(x)
    if (ls.isDirectory()) return roots.push(x.replace(/\/$/,''))
    if (ls.isFile()) return files.push(x)
    else return includes.push(x)
  }))
  if (files.length && !roots.length && !includes.length) return files //> all files resolved

  // Prepare UNIX find command to fetch matching files
  let find = `find -L ${roots.join(' ')||'.'} -type f`
  if (patterns.length) find += ` \\( ${ patterns.map (p=>`-name "${p.replace(/^([^*])/,'*$1')}"`).join(' -o ') } \\)`
  if (includes.length) find += ` \\( ${ includes.map (p=>`-regex .*${p.replace(/\./g,'\\\\.')}.*`).join(' -o ') } \\)`
  if (excludes.length) find += ` \\( ${ excludes.map (x=>`! -regex .*${x.replace(/\./g,'\\\\.')}.*`).join(' ') } \\)`

  // Execute find command and return list of files
  const exec = require('node:util') .promisify (require('node:child_process').exec)
  const { stdout } = await exec (find)
  return files.concat (stdout.split('\n').slice(0, -1).sort())
}


function list (files) {
  const { relative } = require('node:path'), cwd = process.cwd()
  console.log()
  console.log(`Found ${files.length} test file${files.length > 1 ? 's' : ''}:`, DIMMED, '\n')
  for (let f of files) console.log('  ', relative(cwd, f))
  console.log(RESET)
}


if (!module.parent) {
  // TODO replace w/ common arg parser from node or cds API
  const [ argv, options ] = require('@sap/cds/bin/args') (test, process.argv.slice(2))
  test (argv, options).catch(err => {
    console.error(err)
    process.exitCode = 1
  })
}