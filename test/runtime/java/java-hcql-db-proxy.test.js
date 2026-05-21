const cds_test = require("../../../lib/cds-test");

describe("Java HCQL db proxy", () => {
  const {
    expect,
    cds,
    test: { data },
  } = cds_test(__dirname + "/app");

  const EMILY_ID    = "a0000000-0000-0000-0000-000000000001";
  const POE_ID      = "a0000000-0000-0000-0000-000000000002";
  const WUTHERING_ID = "b0000000-0000-0000-0000-000000000001";
  const RAVEN_ID    = "b0000000-0000-0000-0000-000000000002";
  const GOTHIC_ID   = "c0000000-0000-0000-0000-000000000002";
  const FICTION_ID  = "c0000000-0000-0000-0000-000000000001";

  beforeEach(() => data.reset());

  describe("SELECT", () => {
    it("should return all rows via entity name mapping", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books);

      expect(res.length).to.equal(3);
    });

    it("should filter results with WHERE clause", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books).where({ ID: WUTHERING_ID });

      expect(res.length).to.equal(1);
      expect(res[0].title).to.equal("Wuthering Heights");
    });

    it("should return an object (not array) when select.one is specified", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.one.from(Books).where({ ID: RAVEN_ID });

      expect(res).to.exist;
      expect(res.title).to.equal("The Raven");
    });

    it("should expand to associated entities via mapped association target", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ ID: WUTHERING_ID })
        .columns((b) => {
          (b.ID, b.author((a) => a.name));
        });

      expect(res.length).to.equal(1);
      expect(res[0].author.name).to.equal("Emily Brontë");
    });

    it("should normalise IS NULL filter (= null → is null)", async () => {
      const { Books } = cds.entities("bookshop");
      await INSERT.into(Books).entries({
        title: "Genre-less Book",
        author_ID: EMILY_ID,
      });

      const res = await SELECT.from(Books).where`genre_ID is null`;

      expect(res.length).to.equal(1);
      expect(res[0].title).to.equal("Genre-less Book");
    });
  });

  describe("INSERT", () => {
    it("should insert a single entry and read it back", async () => {
      const { Books } = cds.entities("bookshop");

      await INSERT.into(Books).entries({
        title: "Test Book",
        author_ID: EMILY_ID,
        genre_ID: GOTHIC_ID,
      });

      const res = await SELECT.one.from(Books).where({ title: "Test Book" });

      expect(res).to.exist;
      expect(res.title).to.equal("Test Book");
    });

    it("should normalise columns().values() format to entries before sending", async () => {
      const { Books } = cds.entities("bookshop");
      const NEW_ID = "e0000000-0000-0000-0000-000000000001";

      await INSERT.into(Books)
        .columns("ID", "title", "author_ID", "genre_ID")
        .values(NEW_ID, "Columns Values Book", EMILY_ID, GOTHIC_ID);

      const res = await SELECT.one.from(Books).where({ ID: NEW_ID });

      expect(res).to.exist;
      expect(res.title).to.equal("Columns Values Book");
    });

    it("should normalise columns().rows() format to entries before sending", async () => {
      const { Books } = cds.entities("bookshop");
      const ID_A = "e0000000-0000-0000-0000-000000000002";
      const ID_B = "e0000000-0000-0000-0000-000000000003";

      await INSERT.into(Books)
        .columns("ID", "title", "author_ID", "genre_ID")
        .rows([
          [ID_A, "Rows Book A", EMILY_ID, GOTHIC_ID],
          [ID_B, "Rows Book B", POE_ID, FICTION_ID],
        ]);

      const res = await SELECT.from(Books)
        .where({ ID: { in: [ID_A, ID_B] } })
        .orderBy("title");

      expect(res.length).to.equal(2);
      expect(res[0].title).to.equal("Rows Book A");
    });
  });

  describe("UPDATE", () => {
    it("should update a row and return affected row count via rowCounts", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await UPDATE(Books)
        .set({ title: "Updated" })
        .where({ ID: WUTHERING_ID });

      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res.title).to.equal("Updated");
    });

    it("should normalise IS NULL in SET when clearing a nullable field", async () => {
      const { Books } = cds.entities("bookshop");

      await UPDATE(Books).set({ genre_ID: null }).where({ ID: WUTHERING_ID });

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res.genre_ID).to.not.exist;
    });
  });

  describe("DELETE", () => {
    it("should delete a row and return affected row count via rowCounts", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await DELETE.from(Books).where({ ID: WUTHERING_ID });
      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res).to.not.exist;
    });
  });

  describe("Books.drafts", () => {
    it("should expose Books.drafts on the entity definition via proxy metadata injection", () => {
      const { Books } = cds.entities("bookshop");
      expect(Books.drafts).to.exist;
    });

    it("should return empty array when SELECTing Books.drafts without drafts", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books.drafts);

      expect(res).to.be.an("array").with.length(0);
    });

    it("should INSERT a Books.drafts row with DraftAdministrativeData transitively and return both in SELECT", async () => {
      const { Books } = cds.entities("bookshop");

      const NEW_DRAFT_ID = "dddd0000-0000-0000-0000-000000000001";
      const DRAFT_UUID   = "dddd0000-0000-0000-0000-000000000002";

      await INSERT.into(Books.drafts).entries({
        ID: NEW_DRAFT_ID,
        title: "Draft Insert Test",
        author_ID: EMILY_ID,
        IsActiveEntity: false,
        HasActiveEntity: false,
        HasDraftEntity: true,
        DraftAdministrativeData: { DraftUUID: DRAFT_UUID },
      });

      const row = await SELECT.one
        .from(Books.drafts)
        .where({ ID: NEW_DRAFT_ID });

      expect(row).to.exist;
      expect(row.title).to.equal("Draft Insert Test");
      expect(row.IsActiveEntity).to.equal(false);

      const adminRow = await SELECT.one
        .from("DRAFT.DraftAdministrativeData")
        .where({ DraftUUID: DRAFT_UUID });

      expect(adminRow).to.exist;
      expect(adminRow.DraftUUID).to.equal(DRAFT_UUID);
    });
  });

  describe("array-typed fields", () => {
    it("should persist and return array-typed fields", async () => {
      const { ExpertReviews } = cds.entities("bookshop");

      await INSERT.into(ExpertReviews).entries({
        book_ID: WUTHERING_ID,
        title: "Tagged Review",
        shortText: "A review with tags.",
        tags: ["a", "list", "of", "tags"],
      });

      const res = await SELECT.one
        .from(ExpertReviews)
        .where({ title: "Tagged Review" });

      expect(res).to.exist;
      expect(res.tags).to.deep.equal(["a", "list", "of", "tags"]);
    });
  });

  describe("cds.db.run", () => {
    it("should execute SELECT query via explicit cds.db.run()", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await cds.db.run(SELECT.from(Books));

      expect(res).to.be.an("array").with.length(3);
    });
  });

  describe("UPSERT", () => {
    it("should update an existing row when ID matches", async () => {
      const { Books } = cds.entities("bookshop");

      await UPSERT.into(Books).entries({
        ID: WUTHERING_ID,
        title: "Upserted Title",
      });

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res).to.exist;
      expect(res.title).to.equal("Upserted Title");
    });
  });

  describe("deep write", () => {
    it("should rewrite nested composition entity refs in proxyMap during deep INSERT", async () => {
      const { Books, ExpertReviews } = cds.entities("bookshop");

      const NEW_BOOK_ID   = "eeee0000-0000-0000-0000-000000000001";
      const NEW_REVIEW_ID = "eeee0000-0000-0000-0000-000000000002";

      await INSERT.into(Books).entries({
        ID: NEW_BOOK_ID,
        title: "Deep Write Test Book",
        author_ID: EMILY_ID,
        expertReviews: [
          {
            ID: NEW_REVIEW_ID,
            title: "An expert opinion",
            shortText: "Excellent.",
            longText: "A thorough review.",
          },
        ],
      });

      const book = await SELECT.one.from(Books).where({ ID: NEW_BOOK_ID });
      expect(book).to.exist;
      expect(book.title).to.equal("Deep Write Test Book");

      const reviews = await SELECT.from(ExpertReviews).where({
        book_ID: NEW_BOOK_ID,
      });
      expect(reviews).to.be.an("array").with.length(1);
      expect(reviews[0].ID).to.equal(NEW_REVIEW_ID);
      expect(reviews[0].title).to.equal("An expert opinion");
    });
  });

  describe("CDS-defined DB view (BooksWithAuthor)", () => {
    it("should be accessible through the db proxy", async () => {
      const res = await SELECT.from("bookshop.BooksWithAuthor");
      expect(res.length).to.equal(3);

      const wuthering = res.find((r) => r.title === "Wuthering Heights");
      expect(wuthering).to.exist;
      expect(wuthering.authorName).to.equal("Emily Brontë");
    });
  });

  describe("SELECT.localized", () => {
    it.skip("should return Books with localized field values via SELECT.localized", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await cds.tx({ locale: "de" }, () => SELECT.localized(Books));

      expect(res).to.be.an("array").with.length(3);
      const wuthering = res.find((b) => b.ID === WUTHERING_ID);
      expect(wuthering).to.exist;
      expect(wuthering.title).to.equal("Sturmhöhen");
    });
  });

  describe("DRAFT.DraftAdministrativeData proxy", () => {
    const DRAFT_ADMIN_UUID = "ee000000-0000-0000-0000-000000000001";

    it("should return an empty array when queried with no draft rows present", async () => {
      const rows = await SELECT.from("DRAFT.DraftAdministrativeData");

      expect(rows).to.be.an("array");
      expect(rows.length).to.equal(0);
    });

    it("should allow INSERT into and SELECT from DRAFT.DraftAdministrativeData", async () => {
      await DELETE.from("DRAFT.DraftAdministrativeData").where({ DraftUUID: DRAFT_ADMIN_UUID });

      await INSERT.into("DRAFT.DraftAdministrativeData").entries({
        DraftUUID: DRAFT_ADMIN_UUID,
        CreatedByUser: "test-user",
        LastChangedByUser: "test-user",
      });

      const rows = await SELECT.from("DRAFT.DraftAdministrativeData").where({ DraftUUID: DRAFT_ADMIN_UUID });

      expect(rows).to.be.an("array").with.length(1);
      expect(rows[0].CreatedByUser).to.equal("test-user");
    });
  });
});
