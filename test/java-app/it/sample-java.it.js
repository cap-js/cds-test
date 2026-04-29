const cds_test = require("../../../lib/cds-test");

describe("Java integration", () => {
  if (!/java/.test(process.env.CDS_ENV)) return test.skip();

  const { GET, POST, expect, cds, test } = cds_test(__dirname + "/..");

  it("serves Books via Java OData endpoint", async () => {
    const { data } = await GET`/odata/v4/catalog/Books`;
    expect(data.value).to.exist;
    expect(data.value.length).to.be.greaterThanOrEqual(1);
  });

  it("accesses database via HCQL proxy", async () => {
    const { Books } = cds.entities("bookshop");
    const data = await cds.ql`SELECT ID FROM ${Books}`;
    expect(data.length).to.be.greaterThanOrEqual(1);
  });

  describe("data reset", () => {
    it("restores exact seed data after mutation", async () => {
      await POST(`/odata/v4/catalog/Books`, { ID: 9999, title: "Test" });
      const { data: dirty } = await GET`/odata/v4/catalog/Books`;
      expect(dirty.value.find((b) => b.ID === 9999)).to.exist;

      await test.data.reset();

      const { data } = await GET`/odata/v4/catalog/Books`;
      expect(data.value.map((b) => b.ID).sort((a, b) => a - b)).to.deep.equal([
        1, 2, 3,
      ]);
      expect(data.value.find((b) => b.ID === 9999)).to.not.exist;
    });
  });
});
