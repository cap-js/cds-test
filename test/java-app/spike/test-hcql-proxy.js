'use strict'

// Minimal spike to verify Java's hcqlProxy service responds correctly to cds.ql queries.
// Assumes Java is already running. Pass the base URL as first argument (default: http://localhost:8080).
// Usage: node spike/test-hcql-proxy.js [http://localhost:PORT]

require('@sap/cds') // sets up SELECT / INSERT / UPDATE / DELETE globals

const JAVA_URL = process.argv[2] ?? 'http://localhost:8080'
const ENDPOINT = `${JAVA_URL}/hcql/hcqlProxy`

async function hcql(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
  })
  const json = await res.json()
  if (json.errors?.length) {
    const err = new Error(json.errors[0].message)
    err.status = res.status
    err.errors = json.errors
    throw err
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return json
}

let passed = 0, failed = 0
async function check(label, fn) {
  try {
    const display = await fn()
    console.log(`  ✓  ${label}${display != null ? ': ' + display : ''}`)
    passed++
  } catch (e) {
    console.log(`  ✗  ${label}: ${e.message}`)
    failed++
  }
}

async function main() {
  console.log(`\nHCQL proxy spike — ${ENDPOINT}\n`)

  // The six table-backed entities exposed by the hcqlProxy service.
  // Flat names — each maps via @cds.persistence.name to the actual H2 table.
  const entities = [
    'hcqlProxy.Authors',
    'hcqlProxy.Books',
    'hcqlProxy.BookTexts',
    'hcqlProxy.Messages',
    'hcqlProxy.DraftAdminData',
    'hcqlProxy.BooksDrafts',
  ]

  // ── SELECT ─────────────────────────────────────────────────────────────────
  // Verifies Java can route SELECT queries to the correct H2 table.
  // Authors and Books are pre-seeded from db/data/*.csv — expect >0 rows there.
  console.log('SELECT')
  for (const entity of entities) {
    await check(entity, async () => {
      const { data } = await hcql(SELECT.from(entity))
      return `${data.length} row(s)`
    })
  }

  // ── SELECT with WHERE ───────────────────────────────────────────────────────
  console.log('\nSELECT with WHERE')
  await check('Authors where ID = 1', async () => {
    const { data } = await hcql(SELECT.from('hcqlProxy.Authors').where({ ID: 1 }))
    return data[0]?.name ?? '(no row)'
  })
  await check('Books where ID = 1', async () => {
    const { data } = await hcql(SELECT.from('hcqlProxy.Books').where({ ID: 1 }))
    return data[0]?.title ?? '(no row)'
  })

  // ── DELETE ─────────────────────────────────────────────────────────────────
  // This is the data.reset() benchmark: cds.test calls DELETE on every table entity.
  // All six must succeed without a 500.
  console.log('\nDELETE (data.reset benchmark)')
  for (const entity of entities) {
    await check(entity, async () => {
      const result = await hcql(DELETE.from(entity))
      const count = result.rowCounts?.reduce((a, b) => a + b, 0) ?? result.data
      return `${count} deleted`
    })
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
