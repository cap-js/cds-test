const cds = require('@sap/cds')
const InsertResults = require('@cap-js/db-service/lib/InsertResults')
// `validateStatus: () => true` makes all HTTP responses resolve (never throw), so the
// status/error checks below can run for both HCQL-format errors and raw HTTP errors.
const HCQL_REQ_CONFIG = { headers: { 'content-type': 'application/json' }, validateStatus: () => true }

module.exports = class extends cds.Service {
  async init() {
    const { axios, proxyMap, java } = this.options
    const inFlight = new Map()

    this.on('*', async (req) => {
      if (java.crashed) {
        const { code, signal } = java.crashed
        throw new Error(`Java application has crashed (${signal ? `signal ${signal}` : `exit code ${code}`})`)
      }

      let json = JSON.stringify(req.query)

      // CQN JSON can include (fully qualified) db-entity-names in only two places:
      //   As the first element of a `ref` array, always preceeded by '[' 
      //   > e.g.: ["db.bookshop.Books"...]
      //   As an id in a navigation segment, always preceeded by '"id":'
      //   > e.g.: {"id":"bookshop.Books",...}
      // -> Use replace instead of parsing the CQN, to inject proxy-entity-refs
      for (const [from, to] of Object.entries(proxyMap))
        json = json.replace(new RegExp(`(?<=\\[|"id":)"${from.replace(/\./g, '\\.')}"`, 'g'), `"${to}"`)

      // Java HCQL rejects `= {"val":null}`:
      // -> globally convert to `is "null"`
      json = json.replace(/"=",{"val":null}/g,  '"is","null"')
      json = json.replace(/"!=",{"val":null}/g, '"is not","null"')

      const query = JSON.parse(json)

      // Normalize INSERT rows → entries
      if (query.INSERT?.rows && query.INSERT.columns) {
        query.INSERT.entries = query.INSERT.rows.map((row) => {
          return query.INSERT.columns.reduce((entry, column, index) => {
            entry[column] = row[index]
            return entry
          }, {})
        })
        delete query.INSERT.rows
      }

      // Normalize INSERT values (single-row) → entries
      if (query.INSERT?.values && query.INSERT.columns) {
        query.INSERT.entries = [
          query.INSERT.columns.reduce((entry, column, index) => {
            entry[column] = query.INSERT.values[index]
            return entry
          }, {})
        ]
        delete query.INSERT.values
      }

      const id = cds.utils.uuid()
      inFlight.set(id, query)

      try {
        const res = await axios.post('/hcql/dbProxy', query, HCQL_REQ_CONFIG)
          .catch(async connErr => {
            await new Promise(r => setImmediate(r))
            if (java.crashed) {
              const { code, signal } = java.crashed
              const queries = [...inFlight.values()].map(q => JSON.stringify(q)).join(' | ')
              throw new Error(`Java application crashed (${signal ? `signal ${signal}` : `exit code ${code}`}) while processing: ${queries}`)
            }
            throw connErr
          })

        if (res.data.errors?.length) {
          for (const { message } of res.data.errors) req.error(message)
          throw req.reject()
        }

        if (res.status >= 400) {
          req.error(res.data?.message ?? res.data?.error ?? `HCQL request failed with HTTP ${res.status}`)
          try { req.reject() } catch (err) {
            err.proxyError = true
            err.httpStatus = res.status
            throw err
          }
        }

        if (req.query.SELECT)
          return req.query.SELECT.one ? res.data.data[0] : res.data.data
        if (req.query.INSERT) return new InsertResults(req.query, res.data.data)

        return (
          res.data.rowCounts?.reduce((l, c) => l + c) ??
          res.data.data?.length ??
          res.data.data
        )
      } finally {
        inFlight.delete(id)
      }
    })
  }

  // Overrides parent URL derivation — this service has no URL; the string is for display only.
  url4() { return 'Java Proxy' }
}
