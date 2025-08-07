const cds = require('@sap/cds')

const InsertResults = require('@cap-js/db-service/lib/InsertResults')

module.exports = class extends cds.Service {
  init() {
    this.on('*', async req => {
      const { axios } = this.options

      // REVISIT: make draft and text direct access work
      if (
        req.target.isDraft ||
        req.target.includes?.includes('sap.common.TextsAspect')
      ) return []

      if (req.query.INSERT?.rows) {
        req.query.INSERT.entries = req.query.INSERT?.rows
          .map(r => req.query.INSERT.columns.reduce((l, c, i) => {
            l[c] = r[i]
            return l
          }, {}))
        req.query.INSERT.rows = undefined
      }

      const service = cds.model.services[req.path.split('.')[0]]
      if (!service) {
        const sub = req.query[req.query.kind]
        const ref = sub.from || sub.into || sub.entity
        if (!ref) { debugger }
        if (ref.ref[0].id) ref.ref[0].id = 'db.' + ref.ref[0].id
        else ref.ref[0] = 'db.' + ref.ref[0]
      }
      const res = await axios.post('/hcql/' + (service?.['@path'] ?? 'db'), req.query, { headers: { 'content-type': 'application/json' } })

      // Convert HCQL result format to @cap-js/db-service compliant results
      if (req.query.SELECT) return req.query.SELECT?.one ? res.data.data[0] : res.data.data
      if (req.query.INSERT) return new InsertResults(req.query, res.data.data)
      return res.data.rowCounts.reduce((l, c) => l + c)
    })
  }
  url4() { return 'Java Proxy' }
}