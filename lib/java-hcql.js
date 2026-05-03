"use strict";
const cds = require("@sap/cds");
const InsertResults = require("@cap-js/db-service/lib/InsertResults");
const HCQL_REQ_CONFIG = { headers: { "content-type": "application/json" } };

module.exports = class extends cds.Service {
  async init() {
    const { axios, proxyMap } = this.options;
    // TODO: We could simply override validateStatus in here ... What would be the implications?

    this.on("*", async (req) => {
      let json = JSON.stringify(req.query);
      for (const [from, to] of Object.entries(proxyMap))
        json = json.replace(
          // TODO: Why remove the negative look behind? IMO we should keep it.
          new RegExp(`"${from.replace(/\./g, "\\.")}"`, "g"),
          `"${to}"`,
        );
      const query = JSON.parse(json);

      // Normalize INSERT rows → entries
      if (query.INSERT?.rows) {
        query.INSERT.entries = query.INSERT.rows.map((row) =>
          query.INSERT.columns.reduce(
            (e, col, i) => ({ ...e, [col]: row[i] }),
            {},
          ),
        );
        delete query.INSERT.rows;
      }
      // Normalize INSERT values (single-row) → entries
      if (query.INSERT?.values) {
        query.INSERT.entries = [query.INSERT.columns.reduce(
          (e, col, i) => ({ ...e, [col]: query.INSERT.values[i] }),
          {},
        )];
        delete query.INSERT.values;
      }

      // TODO: Review if this where replacement is truely _necessary_
      // Normalize null equality checks: CDS ql emits `= {"val": null}` for .where({field: null}),
      // but SQL requires IS NULL. Convert to the canonical CQN form `is "null"` that Java handles.
      const fixNullWhere = (where) => {
        if (!Array.isArray(where)) return
        for (let i = 0; i < where.length; i++) {
          if (Array.isArray(where[i])) fixNullWhere(where[i])
          else if (where[i] === '=' && where[i + 1]?.val === null) { where[i] = 'is';     where[i + 1] = 'null' }
          else if (where[i] === '!=' && where[i + 1]?.val === null) { where[i] = 'is not'; where[i + 1] = 'null' }
        }
      }
      for (const stmt of ['SELECT', 'UPDATE', 'DELETE'])
        if (query[stmt]?.where) fixNullWhere(query[stmt].where)

      const res = await axios.post("/hcql/dbProxy", query, HCQL_REQ_CONFIG)
      
      // Extract possible response errors
      if (res.data.errors?.length) {
        for (const { message } of res.data.errors) req.error(message)
        throw req.reject()
      }

      // This proxy does not have to be a test in itself
      // I.e.: It's okay to screw with the orginal response

      if (req.query.SELECT)
        return req.query.SELECT.one ? res.data.data[0] : res.data.data;
      if (req.query.INSERT) return new InsertResults(req.query, res.data.data);
      // UPDATE returns data (not rowCounts) — coerce to affected-row count
      
      return (
        res.data.rowCounts?.reduce((l, c) => l + c) ??
        res.data.data?.length ??
        res.data.data
      );
    });
  }

  url4() { return "Java Proxy" }
};
