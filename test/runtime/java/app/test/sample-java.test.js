const cds_test = require("../../../../../lib/cds-test");

describe("Java integration", () => {
  if (!/java/.test(process.env.CDS_ENV))
    return it("skipped in profile node", () => {});

  const {
    GET,
    expect,
    cds,
    test: { data },
  } = cds_test(__dirname + "/..");

  const EMILY_ID     = 'a0000000-0000-0000-0000-000000000001'
  const WUTHERING_ID = 'b0000000-0000-0000-0000-000000000001'

  it("serves Books via Java OData endpoint", async () => {
    const res = await GET`/odata/v4/catalog/Books`;
    expect(res.data.value).to.exist;
    expect(res.data.value.length).to.be.greaterThanOrEqual(1);
  });

  it("data reset restores seed data after mutation", async () => {
    // OData POST on a draft-enabled entity creates a draft, not an active book —
    // use direct HCQL INSERT to create an active record that data.reset() can clean up.
    const { Books } = cds.entities('bookshop');
    await INSERT.into(Books).entries({ title: "Test", author_ID: EMILY_ID });
    const beforeReset = await GET`/odata/v4/catalog/Books`;
    expect(beforeReset.data.value.find((b) => b.title === "Test")).to.exist;

    await data.reset();

    const afterReset = await GET("/odata/v4/catalog/Books?$orderby=title");
    expect(afterReset.data.value.length).to.equal(3);
    expect(afterReset.data.value.find((b) => b.title === "Test")).not.to.exist;
  });

  it("filters Books via OData $filter", async () => {
    const res = await GET(`/odata/v4/catalog/Books?$filter=ID eq ${WUTHERING_ID}`);
    expect(res.data.value.length).to.equal(1);
    expect(res.data.value[0].title).to.equal("Wuthering Heights");
  });

  it("projects columns via OData $select", async () => {
    const res = await GET("/odata/v4/catalog/Books?$select=ID,title");
    expect(res.data.value.length).to.equal(3);
    expect(res.data.value[0]).to.have.property("ID");
    expect(res.data.value[0]).to.have.property("title");
    expect(res.data.value[0]).not.to.have.property("author_ID");
  });

  it("orders Books via OData $orderby", async () => {
    const res = await GET("/odata/v4/catalog/Books?$orderby=title");
    expect(res.data.value[0].title).to.equal("Eleonora");
    expect(res.data.value[2].title).to.equal("Wuthering Heights");
  });

  it("paginates via OData $top and $skip", async () => {
    const res = await GET("/odata/v4/catalog/Books?$orderby=title&$top=2&$skip=1");
    expect(res.data.value.length).to.equal(2);
    expect(res.data.value[0].title).to.equal("The Raven");
  });

  it("expands associated Author via OData $expand", async () => {
    const res = await GET(`/odata/v4/catalog/Books?$filter=ID eq ${WUTHERING_ID}&$expand=author`);
    expect(res.data.value.length).to.equal(1);
    expect(res.data.value[0].author).to.exist;
    expect(res.data.value[0].author.name).to.equal("Emily Brontë");
  });

  it("returns total count via OData $count", async () => {
    const res = await GET("/odata/v4/catalog/Books/$count");
    expect(res.data).to.equal(3);
  });

  it("returns Genres with children via OData $expand", async () => {
    const res = await GET("/odata/v4/catalog/Genres?$expand=children&$filter=parent_ID eq null");
    expect(res.data.value.length).to.equal(1);
    expect(res.data.value[0].name).to.equal("Fiction");
    expect(res.data.value[0].children.length).to.equal(2);
  });
});
