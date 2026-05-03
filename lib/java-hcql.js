"use strict";

const cds = require("@sap/cds");
const InsertResults = require("@cap-js/db-service/lib/InsertResults");
const HCQL_REQ_CONFIG = { headers: { "content-type": "application/json" } };

module.exports = class extends cds.Service {
  async init() {
    const { axios, proxyMap } = this.options;

    this.on("*", async (req) => {
      let json = JSON.stringify(req.query);
      for (const [from, to] of Object.entries(proxyMap))
        json = json.replace(
          new RegExp(`(?<!:)"${from.replace(/\./g, "\\.")}"`, "g"),
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

      const res = await axios.post("/hcql/db", query, HCQL_REQ_CONFIG);
      // TODO: Can we use req.error instead?
      if (res.data.errors?.length) throw Object.assign(
        new Error(res.data.errors[0].message), 
        { errors: res.data.errors }
      );

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
