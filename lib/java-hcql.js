const cds = require('@sap/cds')

const InsertResults = require('@cap-js/db-service/lib/InsertResults')
const HCQL_REQ_CONFIG = { headers: { 'content-type': 'application/json' } }

module.exports = class extends cds.Service {
  init() {
    this.on('*', async req => {
      const { axios } = this.options

      if (req.query.INSERT?.rows) { // ... convert rows to entries
        req.query.INSERT.entries = req.query.INSERT?.rows.map(row => 
          req.query.INSERT.columns.reduce((entry, column, index) => 
            Object.assign(entry, { [column]: row[index]}),
            {}
          )
        )
        
        req.query.INSERT.rows = undefined
      }

      const service = cds.model.services[req.path.split('.')[0]]
      if (service && service.name !== 'db') req.error('Whatever should be thrown when we try to access a service entity from db ...')
      
      if (!service) {
        const sub = req.query[req.query.kind]
        const ref = sub.from || sub.into || sub.entity
        if (!ref) throw new Error(`HCQL: cannot resolve target ref for ${req.query.kind} on ${req.path}`)
          if (ref.ref[0].id) ref.ref[0].id = 'db.' + ref.ref[0].id
        else ref.ref[0] = 'db.' + ref.ref[0]
      }
      
      // Send a HCQL request to the HCQL 'db' service we inject into the Java runtime
      // > By exposing the entire 'db' via `@hcql` from Java and proxying requests 
      // > sent to `const db = await cds.connect.to('db')` to that service, 
      // > via this handler, we can (or at least should be able to) restore 
      // > functioning `await cds.ql` in the test runtime.
      const res = await axios.post('/hcql/db', req.query, HCQL_REQ_CONFIG)

      // Emulate the default behavior of validateStatus if the default was overridden
      if (res.data.errors?.length) throw Object.assign(new Error(res.data.errors[0].message), { errors: res.data.errors })

      // Convert HCQL result format to @cap-js/db-service compliant results
      if (req.query.SELECT) return req.query.SELECT?.one ? res.data.data[0] : res.data.data
      if (req.query.INSERT) return new InsertResults(req.query, res.data.data)
      return res.data.rowCounts?.reduce((l, c) => l + c) ?? res.data.data
    })
  }
  
  url4() { return 'Java Proxy' }
}