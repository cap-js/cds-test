'use strict'

// Rewrite approach B: JSON clone → recursive CQN traversal → mutate ref[0].
// Walks the entire CQN object tree and rewrites any ref whose first element
// matches a proxyMap key.
//
// Safety: entity names are fully-qualified strings with dots ('bookshop.Books');
// navigation-path segments ('author', 'name') and table aliases ('a') are
// plain identifiers that will never appear in the proxyMap.
//
// Usage: node spike/rewrite-recursive.js [http://localhost:PORT]

require('@sap/cds')
const cds = require('@sap/cds')
const path = require('path')

const JAVA_URL = process.argv[2] ?? 'http://localhost:8080'
const ENDPOINT = `${JAVA_URL}/hcql/hcqlProxy`

const proxyMap = {
  'bookshop.Authors': 'hcqlProxy.Authors',
  'bookshop.Books':   'hcqlProxy.Books',
}

function _walk(node, map) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { node.forEach(n => _walk(n, map)); return }
  if (Array.isArray(node.ref) && map[node.ref[0]]) node.ref[0] = map[node.ref[0]]
  Object.values(node).forEach(v => _walk(v, map))
}

function rewrite(query, map) {
  const q = JSON.parse(JSON.stringify(query))
  _walk(q, map)
  return q
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

function report(label, original, rewritten, { status, json }) {
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

  console.log(`\nRewrite B (recursive) — ${ENDPOINT}\n`)

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

  for (const [label, original] of cases) {
    const rewritten = rewrite(original, proxyMap)
    const result    = await hcql(rewritten)
    report(label, original, rewritten, result)
  }
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
