'use strict'

// Verifies that the `db` HCQL service (srv/db.json) works with Java.
// Follows the same pattern as rewrite-string.js:
//   build CQN with real bookshop.* entities → rewrite → POST to /hcql/db
//
// Key question: does Java HCQL resolve managed associations (keys form) for
// expand and WHERE path expressions?
//
// Prerequisite: Java app running with db.cds/db.json loaded.
//   cd cds-test/test/java-app && mvn -f srv/pom.xml spring-boot:run
//
// Usage: node spike/test-db-service.js [http://localhost:PORT]

const cds = require('@sap/cds')
const path = require('path')

const JAVA_URL = process.argv[2] ?? 'http://localhost:8080'
const ENDPOINT = `${JAVA_URL}/hcql/db`

const proxyMap = {
  'bookshop.Authors': 'db.bookshop.Authors',
  'bookshop.Books':   'db.bookshop.Books',
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
  const detail = isError
    ? json.errors?.[0]?.message ?? JSON.stringify(json)
    : JSON.stringify(json.data?.[0] ?? json).slice(0, 120)
  const mark = isError ? '✗' : '✓'
  console.log(`  [${status}] ${mark} ${label}`)
  console.log(`         → ${detail}`)
}

async function main() {
  const appDir = path.resolve(__dirname, '..')
  cds.model = cds.linked(await cds.load(['db', 'srv'], { root: appDir }))

  const Books = cds.model.definitions['bookshop.Books']

  console.log(`\ndb HCQL service verification — ${ENDPOINT}\n`)

  const cases = [
    ['SELECT * from Books',                SELECT.from(Books)],
    ['SELECT WHERE scalar (ID = 1)',       SELECT.from(Books).where({ ID: 1 })],
    ['SELECT.one WHERE (ID = 2)',          SELECT.one.from(Books).where({ ID: 2 })],
    // Key test: managed association → expand
    ['[KEY] expand to author (managed)',   SELECT.from(Books).where({ ID: 1 }).columns(b => { b.ID, b.author(a => a.name) })],
    // Key test: managed association → WHERE path expression
    ['[KEY] WHERE author.name = ...',      SELECT.from(Books).where`author.name = ${'Emily Brontë'}`],
    ['SELECT Books.texts',                 SELECT.from('bookshop.Books.texts')],
    ['SELECT Books.texts WHERE locale+ID', SELECT.from('bookshop.Books.texts').where({ ID: 1, locale: 'en' })],
    ['INSERT single Book',                 INSERT.into(Books).entries({ ID: 99, title: 'Spike Book', author_ID: 1 })],
    ['SELECT after INSERT',                SELECT.one.from(Books).where({ ID: 99 })],
    ['UPDATE Book title',                  UPDATE(Books).set({ title: 'Updated' }).where({ ID: 99 })],
    ['DELETE Book',                        DELETE.from(Books).where({ ID: 99 })],
  ]

  for (const [label, query] of cases) {
    const result = await hcql(rewrite(query, proxyMap))
    report(label, result)
  }

  console.log()
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
