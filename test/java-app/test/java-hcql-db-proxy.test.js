const cds_test = require("../../../lib/cds-test");

describe("Java HCQL db proxy", () => {
  if (!/java/.test(process.env.CDS_ENV))
    return it("skipped in profile node", () => {});

  const { expect, cds, test: { data } } = cds_test(__dirname + "/..");

  const EMILY_ID     = 'a0000000-0000-0000-0000-000000000001'
  const POE_ID       = 'a0000000-0000-0000-0000-000000000002'
  const WUTHERING_ID = 'b0000000-0000-0000-0000-000000000001'
  const RAVEN_ID     = 'b0000000-0000-0000-0000-000000000002'
  const ELEONORA_ID  = 'b0000000-0000-0000-0000-000000000003'
  const FICTION_ID   = 'c0000000-0000-0000-0000-000000000001'
  const GOTHIC_ID    = 'c0000000-0000-0000-0000-000000000002'
  const REVIEW_ID      = 'd0000000-0000-0000-0000-000000000001'
  const REVIEW_META_ID = 'e0000000-0000-0000-0000-000000000001'

  beforeEach(() => data.reset())

  describe("SELECT", () => {
    // TODO: Review AI Test
    it("returns all Books", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books)

      expect(res.length).to.equal(3)
    })

    // TODO: Review AI Test
    it("filters with WHERE clause", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID })

      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("projects specific columns", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).columns('ID')

      expect(res.length).to.equal(3)
      expect(res[0]).to.have.property('ID')
      expect(res[0]).not.to.have.property('title')
    })

    // TODO: Review AI Test
    it("orders results", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).columns('title').orderBy('title desc')

      expect(res.map(r => r.title)).to.deep.equal(['Wuthering Heights', 'The Raven', 'Eleonora'])
    })

    // TODO: Review AI Test
    it("returns first 2 books alphabetically when limit is applied", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).columns('title').orderBy('title').limit(2)

      expect(res.length).to.equal(2)
      expect(res[0].title).to.equal('Eleonora')
      expect(res[1].title).to.equal('The Raven')
    })

    // TODO: Review AI Test
    it("returns one row with SELECT.one", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.one.from(Books).where({ ID: RAVEN_ID })

      expect(res).to.exist
      expect(res.title).to.equal('The Raven')
    })

    // TODO: Review AI Test
    it("returns undefined for no-match SELECT.one", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.one.from(Books).where({ ID: '00000000-0000-0000-0000-000000000000' })

      expect(res).to.not.exist
    })

    // TODO: Review AI Test
    it("expands to associated Author", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID })
        .columns(b => { b.ID, b.author(a => a.name) })

      expect(res.length).to.equal(1)
      expect(res[0].author.name).to.equal('Emily Brontë')
    })

    // TODO: Review AI Test
    it("filters with tagged template WHERE", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where`ID = ${WUTHERING_ID}`

      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("filters with expression-pair WHERE", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where('ID =', WUTHERING_ID)

      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("filters with implicit AND (multi-key object)", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID, title: 'Wuthering Heights' })

      expect(res.length).to.equal(1)
    })

    // TODO: Review AI Test
    it("filters with IN operator", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: { in: [RAVEN_ID, ELEONORA_ID] } })

      expect(res.length).to.equal(2)
    })

    // TODO: Review AI Test
    it("filters with not-equal operator", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: { '!=': WUTHERING_ID } })

      expect(res.length).to.equal(2)
    })

    // TODO: Review AI Test
    it("projects multiple columns", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).columns('ID', 'title')

      expect(res.length).to.equal(3)
      expect(res[0]).to.have.property('ID')
      expect(res[0]).to.have.property('title')
      expect(res[0]).not.to.have.property('author_ID')
    })

    // TODO: Review AI Test
    it("selects by key shorthand SELECT.from(entity, key)", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books, WUTHERING_ID)

      expect(res).to.exist
      expect(res.title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("returns one row with SELECT.one(entity, key) shorthand", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.one(Books, RAVEN_ID)

      expect(res).to.exist
      expect(res.title).to.equal('The Raven')
    })

    // TODO: Review AI Test
    it("orders results ascending by title", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).columns('title').orderBy('title')

      expect(res.map(r => r.title)).to.deep.equal(['Eleonora', 'The Raven', 'Wuthering Heights'])
    })

    // TODO: Review AI Test
    it("orders by multiple columns", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).columns('author_ID', 'title').orderBy('author_ID', 'title')

      expect(res[0].author_ID).to.equal(EMILY_ID)
      expect(res[0].title).to.equal('Wuthering Heights')
      expect(res[1].author_ID).to.equal(POE_ID)
      expect(res[1].title).to.equal('Eleonora')
      expect(res[2].author_ID).to.equal(POE_ID)
      expect(res[2].title).to.equal('The Raven')
    })

    // TODO: Review AI Test
    it("paginates with limit and offset", async () => {
      const { Books } = cds.entities('bookshop')

      const allByTitle = await SELECT.from(Books).columns('title').orderBy('title')
      const res = await SELECT.from(Books).columns('title').orderBy('title').limit(2, 1)

      expect(res.length).to.equal(2)
      expect(res[0].title).to.equal(allByTitle[1].title)
    })

    // TODO: Review AI Test
    it("returns distinct values", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.distinct.from(Books).columns('author_ID')

      expect(res.length).to.equal(2)
    })

    // TODO: Review AI Test
    it("expands to associated Genre", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID })
        .columns(b => { b.ID, b.genre(g => g.name) })

      expect(res.length).to.equal(1)
      expect(res[0].genre.name).to.equal('Gothic')
    })

    // TODO: Review AI Test
    it("expands composition ExpertReviews", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID })
        .columns(b => { b.ID, b.expertReviews(r => r.title) })

      expect(res.length).to.equal(1)
      expect(res[0].expertReviews).to.be.an('array')
      expect(res[0].expertReviews[0].title).to.equal('Timeless Gothic Masterpiece')
    })

    // TODO: Review AI Test
    it("expands deep association chain Books → genre → parent", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID })
        .columns(b => { b.ID, b.genre(g => { g.name, g.parent(p => p.name) }) })

      expect(res.length).to.equal(1)
      expect(res[0].genre.name).to.equal('Gothic')
      expect(res[0].genre.parent.name).to.equal('Fiction')
    })
  })

  describe("INSERT", () => {
    // TODO: Review AI Test
    it("inserts a single entry", async () => {
      const { Books } = cds.entities('bookshop')

      await INSERT.into(Books).entries({ title: 'Test Book', author_ID: EMILY_ID, genre_ID: GOTHIC_ID })

      const res = await SELECT.one.from(Books).where({ title: 'Test Book' })
      expect(res).to.exist
      expect(res.title).to.equal('Test Book')
    })

    // TODO: Review AI Test
    it("inserts multiple entries", async () => {
      const { Books } = cds.entities('bookshop')

      await INSERT.into(Books).entries([
        { title: 'Book A', author_ID: EMILY_ID, genre_ID: GOTHIC_ID },
        { title: 'Book B', author_ID: POE_ID,   genre_ID: FICTION_ID },
      ])

      const res = await SELECT.from(Books).where({ title: { in: ['Book A', 'Book B'] } }).orderBy('title')
      expect(res.length).to.equal(2)
      expect(res[0].title).to.equal('Book A')
      expect(res[1].title).to.equal('Book B')
    })

    // TODO: Review AI Test
    it("inserts via columns().values() format", async () => {
      const { Books } = cds.entities('bookshop')
      const NEW_ID = 'e0000000-0000-0000-0000-000000000001'

      await INSERT.into(Books).columns('ID', 'title', 'author_ID', 'genre_ID')
        .values(NEW_ID, 'Columns Values Book', EMILY_ID, GOTHIC_ID)

      const res = await SELECT.one.from(Books).where({ ID: NEW_ID })
      expect(res).to.exist
      expect(res.title).to.equal('Columns Values Book')
    })

    // TODO: Review AI Test
    it("inserts via columns().rows() bulk format", async () => {
      const { Books } = cds.entities('bookshop')
      const ID_A = 'e0000000-0000-0000-0000-000000000002'
      const ID_B = 'e0000000-0000-0000-0000-000000000003'

      await INSERT.into(Books).columns('ID', 'title', 'author_ID', 'genre_ID').rows([
        [ID_A, 'Rows Book A', EMILY_ID, GOTHIC_ID],
        [ID_B, 'Rows Book B', POE_ID,   FICTION_ID],
      ])

      const res = await SELECT.from(Books).where({ ID: { in: [ID_A, ID_B] } }).orderBy('title')
      expect(res.length).to.equal(2)
      expect(res[0].title).to.equal('Rows Book A')
    })
  })

  describe("UPDATE", () => {
    // TODO: Review AI Test
    it("updates a row and returns affected row count", async () => {
      const { Books } = cds.entities('bookshop')

      const count = await UPDATE(Books).set({ title: 'Updated' }).where({ ID: WUTHERING_ID })

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID })
      expect(res.title).to.equal('Updated')
    })

    // TODO: Review AI Test
    it("updates by key shorthand UPDATE(entity, key)", async () => {
      const { Books } = cds.entities('bookshop')

      const count = await UPDATE(Books, WUTHERING_ID).set({ title: 'Key Updated' })

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID })
      expect(res.title).to.equal('Key Updated')
    })

    // TODO: Review AI Test
    it("updates via .with() instead of .set()", async () => {
      const { Books } = cds.entities('bookshop')

      const count = await UPDATE(Books).with({ title: 'With Updated' }).where({ ID: RAVEN_ID })

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: RAVEN_ID })
      expect(res.title).to.equal('With Updated')
    })
  })

  describe("DELETE", () => {
    // TODO: Review AI Test
    it("deletes a row and returns affected row count", async () => {
      const { Books } = cds.entities('bookshop')

      const count = await DELETE.from(Books).where({ ID: WUTHERING_ID })

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID })
      expect(res).to.not.exist
    })

    // TODO: Review AI Test
    it("deletes by key shorthand DELETE.from(entity, key)", async () => {
      const { Books } = cds.entities('bookshop')

      const count = await DELETE.from(Books, ELEONORA_ID)

      expect(count).to.equal(1)
      const res = await SELECT.one.from(Books).where({ ID: ELEONORA_ID })
      expect(res).to.not.exist
    })
  })

  describe("Books.texts (localized)", () => {
    // TODO: Review AI Test
    it("direct SELECT returns all localized rows", async () => {
      const res = await SELECT.from('bookshop.Books.texts')

      expect(res.length).to.equal(4)
    })

    // TODO: Review AI Test
    it("filters texts by ID and locale", async () => {
      const res = await SELECT.from('bookshop.Books.texts').where({ ID: WUTHERING_ID, locale: 'en' })

      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Wuthering Heights')
    })

    // TODO: Review AI Test
    it("data.reset() restores deleted texts row", async () => {
      await DELETE.from('bookshop.Books.texts').where({ ID: WUTHERING_ID, locale: 'en' })
      const afterDelete = await SELECT.from('bookshop.Books.texts').where({ ID: WUTHERING_ID, locale: 'en' })
      expect(afterDelete.length).to.equal(0)

      await data.reset()

      const afterReset = await SELECT.from('bookshop.Books.texts').where({ ID: WUTHERING_ID, locale: 'en' })
      expect(afterReset.length).to.equal(1)
      expect(afterReset[0].title).to.equal('Wuthering Heights')
    })
  })

  describe("Books.drafts", () => {
    // TODO: Review AI Test
    it("Books.drafts accessible on bookshop.Books entity", () => {
      const { Books } = cds.entities('bookshop')

      expect(Books.drafts).to.exist
    })

    // TODO: Review AI Test
    // Note: requires Java's HCQL db service to route draft entity queries
    it("can SELECT from Books.drafts via db service (empty when no drafts exist)", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books.drafts)

      expect(res).to.be.an('array').with.length(0)
    })
  })

  describe("Authors entity", () => {
    // TODO: Review AI Test
    it("returns all Authors", async () => {
      const { Authors } = cds.entities('bookshop')

      const res = await SELECT.from(Authors)

      expect(res.length).to.equal(2)
    })

    // TODO: Review AI Test
    it("inserts an Author and verifies it can be retrieved", async () => {
      const { Authors } = cds.entities('bookshop')
      const NEW_ID = 'a0000000-0000-0000-0000-000000000099'

      await INSERT.into(Authors).entries({ ID: NEW_ID, name: 'Test Author' })

      const res = await SELECT.one.from(Authors).where({ ID: NEW_ID })
      expect(res.name).to.equal('Test Author')
    })

    // TODO: Review AI Test
    it("updates an Author name and verifies the new value is persisted", async () => {
      const { Authors } = cds.entities('bookshop')

      await UPDATE(Authors).set({ name: 'Updated Author' }).where({ ID: EMILY_ID })

      const res = await SELECT.one.from(Authors).where({ ID: EMILY_ID })
      expect(res.name).to.equal('Updated Author')
    })

    // TODO: Review AI Test
    it("deletes an Author and verifies it no longer exists", async () => {
      const { Authors } = cds.entities('bookshop')

      await DELETE.from(Authors).where({ ID: POE_ID })

      const res = await SELECT.one.from(Authors).where({ ID: POE_ID })
      expect(res).to.not.exist
    })
  })

  describe("Genres entity — recursive composition", () => {
    // TODO: Review AI Test
    it("returns all Genres", async () => {
      const { Genres } = cds.entities('bookshop')

      const res = await SELECT.from(Genres)

      expect(res.length).to.equal(3)
    })

    // TODO: Review AI Test
    it("filters root Genres (no parent)", async () => {
      const { Genres } = cds.entities('bookshop')

      const res = await SELECT.from(Genres).where({ parent_ID: null })

      expect(res.length).to.equal(1)
      expect(res[0].name).to.equal('Fiction')
    })

    // TODO: Review AI Test
    it("expands Genre children (one level of recursion)", async () => {
      const { Genres } = cds.entities('bookshop')

      const res = await SELECT.from(Genres).where({ ID: FICTION_ID })
        .columns(g => { g.name, g.children(c => c.name) })

      expect(res.length).to.equal(1)
      expect(res[0].name).to.equal('Fiction')
      expect(res[0].children).to.be.an('array').with.length(2)
      expect(res[0].children.map(c => c.name).sort()).to.deep.equal(['Gothic', 'Romance'])
    })

    // TODO: Review AI Test
    it("inserts a child Genre and verifies it appears under parent", async () => {
      const { Genres } = cds.entities('bookshop')
      const NEW_GENRE_ID = 'c0000000-0000-0000-0000-000000000099'

      await INSERT.into(Genres).entries({ ID: NEW_GENRE_ID, name: 'Horror', parent_ID: FICTION_ID })

      const res = await SELECT.from(Genres).where({ ID: FICTION_ID })
        .columns(g => { g.name, g.children(c => c.name) })
      expect(res[0].children.map(c => c.name)).to.include('Horror')
    })
  })

  describe("ExpertReviews entity", () => {
    // TODO: Review AI Test
    it("returns all ExpertReviews", async () => {
      const { ExpertReviews } = cds.entities('bookshop')

      const res = await SELECT.from(ExpertReviews)

      expect(res.length).to.equal(1)
    })

    // TODO: Review AI Test
    it("inserts a review and verifies roundtrip", async () => {
      const { ExpertReviews } = cds.entities('bookshop')

      await INSERT.into(ExpertReviews).entries({
        book_ID: RAVEN_ID,
        title: 'Poe at his finest',
        shortText: 'Brief but brilliant.',
        longText: 'A masterclass in suspense and meter.',
      })

      const res = await SELECT.from(ExpertReviews).where({ book_ID: RAVEN_ID })
      expect(res.length).to.equal(1)
      expect(res[0].title).to.equal('Poe at his finest')
    })

    // TODO: Review AI Test
    it("updates review title", async () => {
      const { ExpertReviews } = cds.entities('bookshop')

      await UPDATE(ExpertReviews).set({ title: 'Updated Title' }).where({ ID: REVIEW_ID })

      const res = await SELECT.one.from(ExpertReviews).where({ ID: REVIEW_ID })
      expect(res.title).to.equal('Updated Title')
    })

    // TODO: Review AI Test
    it("deletes a review", async () => {
      const { ExpertReviews } = cds.entities('bookshop')

      await DELETE.from(ExpertReviews).where({ ID: REVIEW_ID })

      const res = await SELECT.one.from(ExpertReviews).where({ ID: REVIEW_ID })
      expect(res).to.not.exist
    })
  })

  describe("ReviewMeta nested composition", () => {
    // TODO: Review AI Test
    it("ReviewMeta is accessible via ExpertReviews composition and seed data matches", async () => {
      const { ExpertReviews } = cds.entities('bookshop')

      const res = await SELECT.from(ExpertReviews)
        .where({ ID: REVIEW_ID })
        .columns(r => { r.ID, r.reviewMeta(m => { m.ID, m.rating, m.notes }) })

      expect(res.length).to.equal(1)
      expect(res[0].reviewMeta).to.exist
      expect(res[0].reviewMeta.ID).to.equal(REVIEW_META_ID)
      expect(res[0].reviewMeta.rating).to.equal(5)
      expect(res[0].reviewMeta.notes).to.equal('A landmark in Gothic fiction.')
    })

    // TODO: Review AI Test
    it("INSERT ExpertReview without ReviewMeta has null reviewMeta, then INSERT ReviewMeta and SELECT back verifies roundtrip", async () => {
      const { ExpertReviews, ReviewMeta } = cds.entities('bookshop')

      await INSERT.into(ExpertReviews).entries({
        book_ID: RAVEN_ID,
        title: 'Poe revisited',
        shortText: 'Second look at Poe.',
        longText: 'A deeper dive into the dark poetry.',
      })

      const withoutMeta = await SELECT.one.from(ExpertReviews).where({ book_ID: RAVEN_ID })
      expect(withoutMeta).to.exist
      expect(withoutMeta.reviewMeta_ID).to.not.exist

      await INSERT.into(ReviewMeta).entries({
        expertReview_ID: withoutMeta.ID,
        rating: 4,
        notes: 'Hauntingly good.',
      })

      // Subselect in SET is not supported by HCQL proxy — two-step approach instead
      const insertedMeta = await SELECT.one.from(ReviewMeta).where({ expertReview_ID: withoutMeta.ID })
      await UPDATE(ExpertReviews, withoutMeta.ID).set({ reviewMeta_ID: insertedMeta.ID })

      const withMeta = await SELECT.one.from(ExpertReviews)
        .where({ ID: withoutMeta.ID })
        .columns(r => { r.ID, r.reviewMeta(m => { m.ID, m.rating, m.notes }) })
      expect(withMeta.reviewMeta).to.exist
      expect(withMeta.reviewMeta.rating).to.equal(4)
      expect(withMeta.reviewMeta.notes).to.equal('Hauntingly good.')
    })
  })

  describe("cds.db.run", () => {
    // TODO: Review AI Test
    it("executes query via explicit cds.db.run()", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await cds.db.run(SELECT.from(Books))

      expect(res).to.be.an('array').with.length(3)
    })
  })

  describe("aggregate queries", () => {
    // TODO: Review AI Test
    it("groups by author_ID and returns distinct author rows", async () => {
      const { Books } = cds.entities('bookshop')

      const res = await SELECT.from(Books).groupBy('author_ID').columns('author_ID')

      expect(res).to.be.an('array').with.length(2)
    })
  })

})
