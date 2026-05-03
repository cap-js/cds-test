const cds_test = require("../../../lib/cds-test");

describe("Java HCQL db proxy", () => {
  if (!/java/.test(process.env.CDS_ENV))
    return it("skipped in profile node", () => {});

  const { expect, cds, test: { data } } = cds_test(__dirname + "/..");

  beforeEach(() => data.reset())

  describe("SELECT", () => {
    // TODO: Review AI Test
    it("returns all Books", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.from(Books)

      expect(res.length).to.equal(3)
    })

    // TODO: Review AI Test
    it("filters with WHERE clause", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.from(Books).where({ ID: 1 })

      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("projects specific columns", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.from(Books).columns('ID')

      expect(res.length).to.equal(3)
      expect(res[0]).to.have.property('ID')
      expect(res[0]).not.to.have.property('title')
    })

    // TODO: Review AI Test
    it("orders results", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.from(Books).columns('ID').orderBy('ID desc')

      expect(res.map(r => r.ID)).to.deep.equal([3, 2, 1])
    })

    // TODO: Review AI Test
    it("limits result set", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.from(Books).limit(2)

      expect(res.length).to.equal(2)
    })

    // TODO: Review AI Test
    it("returns one row with SELECT.one", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.one.from(Books).where({ ID: 2 })

      expect(res).to.exist
      expect(res.title).to.equal('The Raven')
    })

    // TODO: Review AI Test
    it("returns undefined for no-match SELECT.one", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.one.from(Books).where({ ID: 9999 })

      expect(res).to.not.exist
    })

    // TODO: Review AI Test
    it("expands to associated Author", async () => {
      const { Books } = cds.entities('db.bookshop')

      const res = await SELECT.from(Books).where({ ID: 1 })
        .columns(b => { b.ID, b.author(a => a.name) })

      expect(res.length).to.equal(1)
      expect(res[0].author.name).to.equal('Emily Brontë')
    })
  })

  describe("INSERT", () => {
    // TODO: Review AI Test
    it("inserts a single entry", async () => {
      const { Books } = cds.entities('db.bookshop')

      await INSERT.into(Books).entries({ ID: 99, title: 'Test Book', author_ID: 10 })

      const res = await SELECT.one.from(Books).where({ ID: 99 })
      expect(res).to.exist
      expect(res.title).to.equal('Test Book')
    })

    // TODO: Review AI Test
    it("inserts multiple entries", async () => {
      const { Books } = cds.entities('db.bookshop')

      await INSERT.into(Books).entries([
        { ID: 97, title: 'Book A', author_ID: 10 },
        { ID: 98, title: 'Book B', author_ID: 11 },
      ])

      const res = await SELECT.from(Books).where({ ID: { in: [97, 98] } }).orderBy('ID')
      expect(res.length).to.equal(2)
    })
  })

  describe("UPDATE", () => {
    // TODO: Review AI Test
    it("updates a row and returns affected row count", async () => {
      const { Books } = cds.entities('db.bookshop')

      const count = await UPDATE(Books).set({ title: 'Updated' }).where({ ID: 1 })

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: 1 })
      expect(res.title).to.equal('Updated')
    })
  })

  describe("DELETE", () => {
    // TODO: Review AI Test
    it("deletes a row and returns affected row count", async () => {
      const { Books } = cds.entities('db.bookshop')

      const count = await DELETE.from(Books).where({ ID: 1 })

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: 1 })
      expect(res).to.not.exist
    })
  })

  describe("Books.texts (localized)", () => {
    // TODO: Review AI Test
    it("direct SELECT returns all localized rows", async () => {
      const res = await SELECT.from('db.bookshop.Books.texts')

      expect(res.length).to.equal(3)
    })

    // TODO: Review AI Test
    it("filters texts by ID and locale", async () => {
      const res = await SELECT.from('db.bookshop.Books.texts').where({ ID: 1, locale: 'en' })

      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("data.reset() restores deleted texts row", async () => {
      await DELETE.from('db.bookshop.Books.texts').where({ ID: 1, locale: 'en' })
      const afterDelete = await SELECT.from('db.bookshop.Books.texts').where({ ID: 1, locale: 'en' })
      expect(afterDelete.length).to.equal(0)

      await data.reset()

      const afterReset = await SELECT.from('db.bookshop.Books.texts').where({ ID: 1, locale: 'en' })
      expect(afterReset.length).to.equal(1)
      expect(afterReset[0].title).to.equal('Wuthering Heights')
    })
  })

  describe("Books.drafts", () => {
    // TODO: Review AI Test
    it("db.bookshop.CatalogService.Books.drafts entity exists in model", () => {
      const BooksDrafts = cds.model.definitions['db.CatalogService.Books.drafts']

      expect(BooksDrafts).to.exist
    })

    // TODO: Review AI Test
    // Note: requires Java's HCQL db service to route draft entity queries
    it("can SELECT from Books.drafts via db service (empty when no drafts exist)", async () => {
      const BooksDrafts = cds.model.definitions['db.CatalogService.Books.drafts']

      const res = await SELECT.from(BooksDrafts)

      expect(res).to.be.an('array')
    })
  })

})
