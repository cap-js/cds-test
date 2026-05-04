'use strict'

// THIS IS THE PREFERRED SPIKE RESULT

// Rewrite approach A: stringify → string replace → parse.
// Exploits the fact that entity names in CQN JSON always appear as
//   "ref":["some.Entity"   (no spaces — JSON.stringify is deterministic)
// That prefix is specific enough to avoid false positives: val/xpr/func nodes
// use different keys, and navigation-path segments are never qualified names.
//
// Usage: node spike/rewrite-string.js [http://localhost:PORT]

require('@sap/cds')
const cds = require('@sap/cds')
const path = require('path')

const JAVA_URL = process.argv[2] ?? 'http://localhost:8080'
const ENDPOINT = `${JAVA_URL}/hcql/hcqlProxy`

const proxyMap = {
  'bookshop.Authors': 'hcqlProxy.Authors',
  'bookshop.Books':   'hcqlProxy.Books',
}

function rewrite(query, map) {
  let json = JSON.stringify(query)
  for (const [real, proxy] of Object.entries(map))
    json = json.replace(new RegExp(`(?<!:)"${real.replace(/\./g, '\\.')}"`, 'g'), `"${proxy}"`)
  return JSON.parse(json)
}

async function hcql(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  })
  const json = await res.json()
  return { status: res.status, json }
}

function report(label, { status, json }) {
  const isError = json.errors?.length || status >= 400
  const detail  = isError
    ? json.errors?.[0]?.message ?? JSON.stringify(json)
    : JSON.stringify(json.data?.[0] ?? json).slice(0, 120)
  console.log(`  [${status}] ${label}`)
  console.log(`         → ${detail}`)
}

async function main() {
  const appDir  = path.resolve(__dirname, '..')
  cds.model     = cds.linked(await cds.load([appDir + '/db', appDir + '/srv']))
  const Books   = cds.model.definitions['bookshop.Books']
  const Authors = cds.model.definitions['bookshop.Authors']

  console.log(`\nRewrite A (string) — ${ENDPOINT}\n`)

  const cases = [
    ['SELECT *',                   SELECT.from(Books)],
    ['SELECT WHERE scalar',        SELECT.from(Books).where({ ID: 1 })],
    ['SELECT WHERE path expr',     SELECT.from(Books).where`author.name = ${'Emily Brontë'}`],
    ['SELECT columns path',        SELECT.from(Books).columns('ID', 'title', 'author.name')],
    ['SELECT expand',              SELECT.from(Books).columns(b => { b`*`; b.author`*` })],
    ['SELECT exists subquery',     SELECT.from(Authors).where({ exists: SELECT.from(Books).where('author_ID = ID') })],
    ['INSERT INTO SELECT',         INSERT.into(Authors).from(SELECT.from(Authors).where({ ID: 99 }))],
    ['DELETE',                     DELETE.from(Books)],
  ]

  for (const [label, query] of cases) {
    const result = await hcql(rewrite(query, proxyMap))
    report(label, result)
  }
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
