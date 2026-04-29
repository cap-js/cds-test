const cds_test = require("../../../lib/cds-test");

describe("Java integration", () => {
  if (!/java/.test(process.env.CDS_ENV))
    return it("skipped in profile node", () => {});

  const {
    GET,
    POST,
    expect,
    cds,
    test: { data },
  } = cds_test(__dirname + "/..");

  it("serves Books via Java OData endpoint", async () => {
    const res = await GET`/odata/v4/catalog/Books`;
    expect(res.data.value).to.exist;
    expect(res.data.value.length).to.be.greaterThanOrEqual(1);
  });

  it("accesses database via HCQL proxy", async () => {
    const { Books } = cds.entities("bookshop");
    const res = await SELECT.from(Books).columns(["ID"]);
    expect(res.length).to.be.greaterThanOrEqual(1);
  });

  describe("data reset", () => {
    it("restores exact seed data after mutation", async () => {
      await POST(`/odata/v4/catalog/Books`, { ID: 9999, title: "Test" });
      const beforeReset = await GET`/odata/v4/catalog/Books`;
      expect(beforeReset.data.value.find((b) => b.ID === 9999)).to.exist;

      await data.reset();

      const afterReset = await GET(
        "/odata/v4/catalog/Books?select=ID&$orderby=ID",
      );
      expect(afterReset.data.value.map((d) => d.ID)).to.deep.equal([1, 2, 3]);
      expect(afterReset.data.value.find((b) => b.ID === 9999)).not.to.exist;
    });
  });
});
