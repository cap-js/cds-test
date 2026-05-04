'use strict'

// Interception chain test: build queries against the REAL bookshop model in Node.js,
// rewrite the root entity ref to the hcqlProxy equivalent, send to Java.
// Validates the full intercept approach end-to-end.

const cds = require('@sap/cds')
const path = require('path')

const JAVA_URL = process.argv[2] ?? 'http://localhost:8080'
const ENDPOINT = `${JAVA_URL}/hcql/hcqlProxy`

// The mapping a generic interceptor would maintain: real entity → proxy entity.
// In the full java.js integration this would be built programmatically from the model.
const proxyMap = {
  'bookshop.Authors': 'hcqlProxy.Authors',
  'bookshop.Books':   'hcqlProxy.Books',
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

function rewriteRoot(cqn) {
  const q = JSON.parse(JSON.stringify(cqn))
  const op = Object.keys(q)[0]
  const fromClause = q[op]?.from ?? q[op]?.into ?? (typeof q[op]?.entity === 'object' ? q[op] : null)
  const ref = fromClause?.ref ?? q[op]?.entity?.ref
  const original = ref?.[0]
  const proxied = proxyMap[original]
  if (proxied && ref) ref[0] = proxied
  return { q, original, proxied }
}

async function main() {
  const appDir = path.resolve(__dirname, '..')
  cds.model = cds.linked(await cds.load([appDir + '/db', appDir + '/srv']))
  const Books   = cds.model.definitions['bookshop.Books']
  const Authors = cds.model.definitions['bookshop.Authors']

  console.log(`\nInterception chain — ${ENDPOINT}`)
  console.log(`Model loaded. bookshop.Books elements: ${Object.keys(Books.elements).join(', ')}\n`)

  const cases = [
    ['SELECT from bookshop.Books',                                  SELECT.from(Books)],
    ['SELECT from bookshop.Books WHERE ID=1',                       SELECT.from(Books).where({ ID: 1 })],
    ['SELECT from bookshop.Books, author{*}',                       SELECT.from(Books).columns(b => { b`*`; b.author`*` })],
    ['SELECT from bookshop.Authors',                                SELECT.from(Authors)],
    // Association navigation in WHERE — the core open question:
    // Does Java resolve { ref: ['author', 'name'] } through hcqlProxy.Books.author?
    ['SELECT from bookshop.Books WHERE author.name = Emily Brontë', SELECT.from(Books).where`author.name = ${'Emily Brontë'}`],
    // Association navigation in columns (path expression, no expand):
    ['SELECT ID, title, author.name from bookshop.Books',           SELECT.from(Books).columns('ID', 'title', 'author.name')],
    // DELETE last — clears table, so must run after all SELECTs:
    ['DELETE from bookshop.Books',                                  DELETE.from(Books)],
  ]

  for (const [label, cqn] of cases) {
    const { q, original, proxied } = rewriteRoot(cqn)
    const { status, json } = await hcql(q)
    const preview = JSON.stringify(json.data?.[0] ?? json.errors?.[0]?.message ?? json).slice(0, 100)
    const rewrite = proxied ? `${original} → ${proxied}` : `${original} (no mapping)`
    console.log(`[${status}] ${label}`)
    console.log(`  rewrite: ${rewrite}`)
    console.log(`  result:  ${preview}`)
    console.log()
  }
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
