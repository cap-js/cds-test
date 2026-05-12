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

  const DRAFT_ID         = 'dc000000-0000-0000-0000-000000000001'
  const DRAFT_ADMIN_ID   = 'da000000-0000-0000-0000-000000000001'

  beforeEach(data.reset) // ... will be awaited before every test

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

  describe("data.reset with DB views", () => {
    it("should leave BooksWithAuthor view queryable with seed data after data.reset", async () => {
      const { BooksWithAuthor, Books } = cds.entities('bookshop')

      // Mutate the underlying table so the view reflects 4 rows
      await INSERT.into(Books).entries({ title: "Temporary", author_ID: EMILY_ID })

      expect((await SELECT.from(BooksWithAuthor)).length).to.equal(4)

      // reset must not throw — a DELETE attempted on a view would propagate here
      await data.reset()

      // View must be queryable and reflect restored seed data
      const afterReset = await SELECT.from(BooksWithAuthor)
      expect(afterReset.length).to.equal(3)
      expect(afterReset.find(r => r.title === 'Temporary')).not.to.exist
    })
  })

  describe("data.reset with draft-enabled entities", () => {
    it("should insert DraftAdministrativeData transitively and delete draft rows on reset", async () => {
      const { Books } = cds.entities('bookshop')

      await INSERT.into(Books.drafts).entries({
        ID: DRAFT_ID,
        DraftAdministrativeData: { DraftUUID: DRAFT_ADMIN_ID, CreatedByUser: 'tester' }
      })

      const drafts = await SELECT.from(Books.drafts)
      expect(drafts.length).to.equal(1)
      expect(drafts[0].ID).to.equal(DRAFT_ID)

      const adminRows = await SELECT.from('DRAFT.DraftAdministrativeData')
        .where({ DraftUUID: DRAFT_ADMIN_ID })
      expect(adminRows.length).to.equal(1)
      expect(adminRows[0].DraftUUID).to.equal(DRAFT_ADMIN_ID)
      expect(adminRows[0].CreatedByUser).to.equal('tester')

      await data.reset()

      const draftsAfterReset = await SELECT.from(Books.drafts)
      expect(draftsAfterReset.length).to.equal(0)

      const adminRowsAfterReset = await SELECT.from('DRAFT.DraftAdministrativeData')
      expect(adminRowsAfterReset.length).to.equal(0)
    })
  })

  describe("data.reset skips composition children via up_ guard", () => {
    it("should restore ExpertReviews to seed count after data.reset without erroring", async () => {
      const { ExpertReviews } = cds.entities('bookshop')
      const insertedID = cds.utils.uuid()

      await INSERT.into(ExpertReviews).entries({
        ID: insertedID,
        book_ID: WUTHERING_ID,
        title: 'Extra Review',
        shortText: 'Short',
        longText: 'Long'
      })

      const before = await SELECT.from(ExpertReviews)
      expect(before.length).to.equal(2)
      expect(before.find(r => r.ID === insertedID)).to.exist
      expect(before.find(r => r.title === 'Extra Review')).to.exist

      await data.reset()

      const after = await SELECT.from(ExpertReviews)
      expect(after.length).to.equal(1)
      expect(after.find(r => r.ID === insertedID)).not.to.exist
    })
  })

  describe("data.reset skips @cds.persistence.skip entities", () => {
    it("should not attempt DELETE on @cds.persistence.skip entities", async () => {
      // beforeEach data.reset() already executed without error;
      // > if SkipMe were included in deletes, Java would error on the non-existent table
      // -> Only test if the entity is part of the model as expected
      const { SkipMe } = cds.entities('bookshop')
      expect(SkipMe).to.exist
      expect(SkipMe.name).to.equal('bookshop.SkipMe')
      expect(SkipMe['@cds.persistence.skip']).to.equal(true)
    })
  })
});
