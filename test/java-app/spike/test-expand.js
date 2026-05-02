'use strict'

// Investigation: Can we send association-navigating CQN to hcqlProxy entities?
// Tests Java's validation behavior and expand capabilities.
// Assumes Java is already running. Pass base URL as first argument.
// Usage: node spike/test-expand.js [http://localhost:PORT]

require('@sap/cds')

const JAVA_URL = process.argv[2] ?? 'http://localhost:8080'
const ENDPOINT = `${JAVA_URL}/hcql/hcqlProxy`

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
  const detail = json.errors?.[0]?.message ?? JSON.stringify(json).slice(0, 120)
  console.log(`  [${status}] ${label}`)
  if (isError) console.log(`         → ${detail}`)
  else console.log(`         → ${JSON.stringify(json.data).slice(0, 120)}`)
}

async function main() {
  console.log(`\nExpand investigation — ${ENDPOINT}\n`)

  // ── Phase 1: Java's validation behavior ───────────────────────────────────
  // Does Java validate column refs against the hcqlProxy entity model,
  // or does it pass them through to SQL (H2)?
  console.log('Phase 1: What does Java validate?')
  console.log('  Expected: hcqlProxy.Books has elements ID, title, author_ID\n')

  // 1a. Column that doesn't exist anywhere (not in model, not in table)
  //     → if "element not found" style error: model-level validation
  //     → if SQL/H2 error: pass-through to SQL
  report('1a. SELECT unknown column [ghost_col] from hcqlProxy.Books',
    await hcql({ SELECT: { from: { ref: ['hcqlProxy.Books'] }, columns: [{ ref: ['ghost_col'] }] } })
  )

  // 1b. Expand on a navigation element that doesn't exist in hcqlProxy.Books
  //     (author is not declared as an element)
  report('1b. SELECT author{*} expand from hcqlProxy.Books (author undeclared)',
    await hcql({
      SELECT: {
        from: { ref: ['hcqlProxy.Books'] },
        columns: [{ ref: ['author'], expand: [{ ref: ['*'] }] }]
      }
    })
  )

  // 1c. SELECT * — baseline sanity check
  report('1c. SELECT * from hcqlProxy.Books (baseline)',
    await hcql({ SELECT: { from: { ref: ['hcqlProxy.Books'] }, columns: [{ ref: ['*'] }] } })
  )

  // 1d. Scalar columns including author_ID (exists in model AND table)
  //     — confirms scalar column refs work as expected
  report('1d. SELECT ID, title, author_ID from hcqlProxy.Books',
    await hcql({
      SELECT: {
        from: { ref: ['hcqlProxy.Books'] },
        columns: [{ ref: ['ID'] }, { ref: ['title'] }, { ref: ['author_ID'] }]
      }
    })
  )

  // ── Phase 2: What does Node.js CDS produce for expand queries? ─────────────
  // Build a query using cds.ql against hcqlProxy.Books with expand.
  // Inspect the raw CQN object — this is what an interceptor would see
  // before sending to Java.
  console.log('\nPhase 2: CQN shape produced by cds.ql for expand queries')
  console.log('  (shows what an interceptor would receive after Node.js builds the query)\n')

  const expandQuery = SELECT.from('hcqlProxy.Books').columns(b => { b`*`; b.author`*` })
  console.log('  cds.ql: SELECT.from(hcqlProxy.Books).columns(b => { b`*`; b.author`*` })')
  console.log('  CQN produced:', JSON.stringify(expandQuery, null, 4))

  // Send the same CQN to Java — will Java accept cds.ql-generated expand CQN?
  report('\n  Java response to cds.ql-generated expand CQN',
    await hcql(expandQuery)
  )

  // ── Phase 3: Interception simulation ─────────────────────────────────────
  // Simulate what the interceptor would do:
  // Build a query against a "real" entity (bookshop.Books concept),
  // manually rewrite the from ref to hcqlProxy.Books, keep expand as-is.
  console.log('\nPhase 3: Intercept simulation — rewrite from ref, keep expand')

  const intercepted = {
    SELECT: {
      from: { ref: ['hcqlProxy.Books'] },   // ← rewritten from 'bookshop.Books'
      columns: [
        { ref: ['ID'] },
        { ref: ['title'] },
        { ref: ['author_ID'] },
        // expand as if Node.js had resolved the association ref name
        { ref: ['author'], expand: [{ ref: ['*'] }] }
      ]
    }
  }
  console.log('  CQN:', JSON.stringify(intercepted))
  report('  Java response to intercepted expand CQN', await hcql(intercepted))
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
