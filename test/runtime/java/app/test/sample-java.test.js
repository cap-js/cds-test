const cds_test = require("../../../../../lib/cds-test");

describe("Java integration", () => {
  const {
    GET,
    expect,
    cds,
    test: { data },
  } = cds_test(__dirname + "/..");

  const EMILY_ID     = 'a0000000-0000-0000-0000-000000000001'
  const WUTHERING_ID = 'b0000000-0000-0000-0000-000000000001'

  beforeEach(() => data.reset())

  it("should serve Books via Java OData endpoint", async () => {
    const res = await GET`/odata/v4/catalog/Books`;
    expect(res.data.value).to.exist;
    expect(res.data.value.length).to.equal(3);
  });

  it("should restore seed data after data.reset", async () => {
    // ... use direct HCQL INSERT to create a record that data.reset() can clean up.
    const { Books } = cds.entities('bookshop');
    await INSERT.into(Books).entries({ title: "Test", author_ID: EMILY_ID });
    
    const beforeReset = await GET`/odata/v4/catalog/Books`;
    expect(beforeReset.data.value.length).to.equal(4);
    expect(beforeReset.data.value.find((b) => b.title === "Test")).to.exist;

    await data.reset();

    const afterReset = await GET("/odata/v4/catalog/Books?$orderby=title");
    expect(afterReset.data.value.length).to.equal(3);
    expect(afterReset.data.value.find((b) => b.title === "Test")).not.to.exist;
  });

  it("should filter Books via OData $filter", async () => {
    const res = await GET(`/odata/v4/catalog/Books?$filter=ID eq ${WUTHERING_ID}`);
    expect(res.data.value.length).to.equal(1);
    expect(res.data.value[0].title).to.equal("Wuthering Heights");
  });

  it("should project columns via OData $select", async () => {
    const res = await GET("/odata/v4/catalog/Books?$select=ID,title");
    expect(res.data.value.length).to.equal(3);
    expect(res.data.value[0]).to.have.property("ID");
    expect(res.data.value[0]).to.have.property("title");
    expect(res.data.value[0]).not.to.have.property("author_ID");
    // TODO: Add additonal expects to make this meaningful
  });

  it("should order Books via OData $orderby", async () => {
    // TODO: This test does not conclusively prove its test intention
    const res = await GET("/odata/v4/catalog/Books?$orderby=title");
    expect(res.data.value[0].title).to.equal("Eleonora");
    expect(res.data.value[2].title).to.equal("Wuthering Heights");
  });

  it("should paginate via OData $top and $skip", async () => {
    const res = await GET("/odata/v4/catalog/Books?$orderby=title&$top=2&$skip=1");
    expect(res.data.value.length).to.equal(2);
    expect(res.data.value[0].title).to.equal("The Raven");
  });

  it("should expand associated Author via OData $expand", async () => {
    const res = await GET(`/odata/v4/catalog/Books?$filter=ID eq ${WUTHERING_ID}&$expand=author`);
    expect(res.data.value.length).to.equal(1);
    expect(res.data.value[0].author).to.exist;
    expect(res.data.value[0].author.name).to.equal("Emily Brontë");
  });

  it("should return total count via OData $count", async () => {
    const res = await GET("/odata/v4/catalog/Books/$count");
    expect(res.data).to.equal(3);
  });

  it("should return Genres with children via OData $expand", async () => {
    const res = await GET("/odata/v4/catalog/Genres?$expand=children&$filter=parent_ID eq null");
    expect(res.data.value.length).to.equal(1);
    expect(res.data.value[0].name).to.equal("Fiction");
    expect(res.data.value[0].children.length).to.equal(2);
  });
});
