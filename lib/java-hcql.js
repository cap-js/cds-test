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
      
      // Entity names appear in CQN JSON in exactly two forms:
      //   ["bookshop.Books"...]         — ref array element, preceded by '['
      //   {"id":"bookshop.Books",...}   — key-shorthand navigation step, preceded by '"id":'
      for (const [from, to] of Object.entries(proxyMap))
        json = json.replace(new RegExp(`(?<=\\[|"id":)"${from.replace(/\./g, "\\.")}"`, "g"), `"${to}"`);
      
      // Java HCQL rejects `= {"val":null}` — convert to `is "null"` form (all nesting depths).
      json = json.replace(/"=",{"val":null}/g,  '"is","null"')
      json = json.replace(/"!=",{"val":null}/g, '"is not","null"')
      
      const query = JSON.parse(json);

      // Normalize INSERT rows → entries
      if (query.INSERT?.rows && query.INSERT.columns) {
        query.INSERT.entries = query.INSERT.rows.map((row) =>
          query.INSERT.columns.reduce(
            (e, col, i) => ({ ...e, [col]: row[i] }),
            {},
          ),
        );
        delete query.INSERT.rows;
      }
      // Normalize INSERT values (single-row) → entries
      if (query.INSERT?.values && query.INSERT.columns) {
        query.INSERT.entries = [query.INSERT.columns.reduce(
          (e, col, i) => ({ ...e, [col]: query.INSERT.values[i] }),
          {},
        )];
        delete query.INSERT.values;
      }

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
      
      return (
        res.data.rowCounts?.reduce((l, c) => l + c) ??
        res.data.data?.length ??
        res.data.data
      );
    });
  }

  url4() { return "Java Proxy" }
};
