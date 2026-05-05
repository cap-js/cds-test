const cds_test = require("../../../lib/cds-test");

describe("Java HCQL db proxy", () => {
  if (!/java/.test(process.env.CDS_ENV))
    return it("skipped in profile node", () => {});

  const {
    expect,
    cds,
    test: { data },
  } = cds_test(__dirname + "/app");

  const EMILY_ID = "a0000000-0000-0000-0000-000000000001";
  const POE_ID = "a0000000-0000-0000-0000-000000000002";
  const WUTHERING_ID = "b0000000-0000-0000-0000-000000000001";
  const RAVEN_ID = "b0000000-0000-0000-0000-000000000002";
  const ELEONORA_ID = "b0000000-0000-0000-0000-000000000003";
  const FICTION_ID = "c0000000-0000-0000-0000-000000000001";
  const GOTHIC_ID = "c0000000-0000-0000-0000-000000000002";
  const REVIEW_ID = "d0000000-0000-0000-0000-000000000001";
  const REVIEW_META_ID = "e0000000-0000-0000-0000-000000000001";
  const REVIEW2_ID = "f0000000-0000-0000-0000-000000000001";
  const REVIEW3_ID = "f0000000-0000-0000-0000-000000000002";
  const META2_ID = "f0000000-0000-0000-0000-000000000003";
  const META3_ID = "f0000000-0000-0000-0000-000000000004";

  beforeEach(() => data.reset());

  describe("SELECT", () => {
    it("should return all", async () => {
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

    it("should allow to select specific columns", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books).columns("ID");

      expect(res.length).to.equal(3);
      expect(res[0]).to.have.property("ID");
      expect(res[0]).not.to.have.property("title");
    });

    it("should order results", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .columns("title")
        .orderBy("title desc");

      expect(res.map((r) => r.title)).to.deep.equal([
        "Wuthering Heights",
        "The Raven",
        "Eleonora",
      ]);
    });

    it("should return the first two ordered entries when limit is applied", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .columns("title")
        .orderBy("title")
        .limit(2);

      expect(res.length).to.equal(2);
      expect(res[0].title).to.equal("Eleonora");
      expect(res[1].title).to.equal("The Raven");
    });

    it("should return an object when select.one is specified", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.one.from(Books).where({ ID: RAVEN_ID });

      expect(res).to.exist;
      expect(res.title).to.equal("The Raven");
    });

    it("should return undefined for no-match select.one", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.one
        .from(Books)
        .where({ ID: "00000000-0000-0000-0000-000000000000" });

      expect(res).to.not.exist;
    });

    it("should expand to associated entities", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ ID: WUTHERING_ID })
        .columns((b) => {
          (b.ID, b.author((a) => a.name));
        });

      expect(res.length).to.equal(1);
      expect(res[0].author.name).to.equal("Emily Brontë");
    });

    it("should filter with IN operator", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books).where({
        ID: { in: [RAVEN_ID, ELEONORA_ID] },
      });

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.ID).sort()).to.deep.equal(
        [RAVEN_ID, ELEONORA_ID].sort(),
      );
    });

    it("should filter with not-equal operator", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books).where({
        ID: { "!=": WUTHERING_ID },
      });

      expect(res.length).to.equal(2);
    });

    it("should return a row by key using SELECT.from(entity, key) shorthand", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books, WUTHERING_ID);

      expect(res).to.exist;
      expect(res.title).to.equal("Wuthering Heights");
    });

    it("should return a single row by key using SELECT.one(entity, key) shorthand", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.one(Books, RAVEN_ID);

      expect(res).to.exist;
      expect(res.title).to.equal("The Raven");
    });

    it("should order by multiple columns", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .columns("author_ID", "title")
        .orderBy("author_ID", "title");

      expect(res[0].author_ID).to.equal(EMILY_ID);
      expect(res[0].title).to.equal("Wuthering Heights");
      expect(res[1].author_ID).to.equal(POE_ID);
      expect(res[1].title).to.equal("Eleonora");
      expect(res[2].author_ID).to.equal(POE_ID);
      expect(res[2].title).to.equal("The Raven");
    });

    it("should paginate results with limit and offset", async () => {
      const { Books } = cds.entities("bookshop");

      const allByTitle = await SELECT.from(Books)
        .columns("title")
        .orderBy("title");

      const res = await SELECT.from(Books)
        .columns("title")
        .orderBy("title")
        .limit(2, 1);

      expect(res.length).to.equal(2);
      expect(res[0].title).to.equal(allByTitle[1].title);
    });

    it("should return distinct values for projected column", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.distinct.from(Books).columns("author_ID");

      expect(res.length).to.equal(2);
    });

    it("should expand to associated Genre", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ ID: WUTHERING_ID })
        .columns((b) => {
          (b.ID, b.genre((g) => g.name));
        });

      expect(res.length).to.equal(1);
      expect(res[0].genre.name).to.equal("Gothic");
    });

    it("should expand composition ExpertReviews to array", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ ID: WUTHERING_ID })
        .columns((b) => {
          (b.ID, b.expertReviews((r) => r.title));
        });

      expect(res.length).to.equal(1);
      expect(res[0].expertReviews).to.be.an("array");
      expect(res[0].expertReviews[0].title).to.equal(
        "Timeless Gothic Masterpiece",
      );
    });

    it("should expand two-level association chain Books → genre → parent", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ ID: WUTHERING_ID })
        .columns((b) => {
          (b.ID,
            b.genre((g) => {
              (g.name, g.parent((p) => p.name));
            }));
        });

      expect(res.length).to.equal(1);
      expect(res[0].genre.name).to.equal("Gothic");
      expect(res[0].genre.parent.name).to.equal("Fiction");
    });

    it("should filter Books by LIKE pattern", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books).where("title like", "%Heights%");

      expect(res.length).to.equal(1);
      expect(res[0].title).to.equal("Wuthering Heights");
    });

    it("should filter Books by OR condition", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where("title =", "Eleonora")
        .or("title =", "The Raven");

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.title).sort()).to.deep.equal([
        "Eleonora",
        "The Raven",
      ]);
    });

    it("should select Books with null genre_ID using IS NULL", async () => {
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

  describe("WHERE comparison operators", () => {
    beforeEach(async () => {
      const { ExpertReviews, Review_Meta } = cds.entities("bookshop");

      await INSERT.into(ExpertReviews).entries([
        {
          ID: REVIEW2_ID,
          book_ID: RAVEN_ID,
          title: "Review 2",
          shortText: "Short 2",
          longText: "Long 2",
        },
        {
          ID: REVIEW3_ID,
          book_ID: ELEONORA_ID,
          title: "Review 3",
          shortText: "Short 3",
          longText: "Long 3",
        },
      ]);
      await INSERT.into(Review_Meta).entries([
        { ID: META2_ID, expertReview_ID: REVIEW2_ID, rating: 3, notes: "Low" },
        { ID: META3_ID, expertReview_ID: REVIEW3_ID, rating: 4, notes: "Mid" },
      ]);
    });

    it("should return Review_Meta rows with rating > 3", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).where("rating >", 3);

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.rating).sort()).to.deep.equal([4, 5]);
    });

    it("should return Review_Meta rows with rating < 5", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).where("rating <", 5);

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.rating).sort()).to.deep.equal([3, 4]);
    });

    it("should return Review_Meta rows with rating >= 4", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).where("rating >=", 4);

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.rating).sort()).to.deep.equal([4, 5]);
    });

    it("should return Review_Meta rows with rating <= 4", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).where("rating <=", 4);

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.rating).sort()).to.deep.equal([3, 4]);
    });

    it("should return Review_Meta rows with rating between 3 and 4", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).where(
        "rating between",
        3,
        "and",
        4,
      );

      expect(res.length).to.equal(2);
      expect(res.map((r) => r.rating).sort()).to.deep.equal([3, 4]);
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

    it("should insert multiple entries and read them back", async () => {
      const { Books } = cds.entities("bookshop");

      await INSERT.into(Books).entries([
        { title: "Book A", author_ID: EMILY_ID, genre_ID: GOTHIC_ID },
        { title: "Book B", author_ID: POE_ID, genre_ID: FICTION_ID },
      ]);

      const res = await SELECT.from(Books)
        .where({ title: { in: ["Book A", "Book B"] } })
        .orderBy("title");

      expect(res.length).to.equal(2);
      expect(res[0].title).to.equal("Book A");
      expect(res[1].title).to.equal("Book B");
    });

    it("should insert via columns().values() format", async () => {
      const { Books } = cds.entities("bookshop");
      const NEW_ID = "e0000000-0000-0000-0000-000000000001";

      await INSERT.into(Books)
        .columns("ID", "title", "author_ID", "genre_ID")
        .values(NEW_ID, "Columns Values Book", EMILY_ID, GOTHIC_ID);

      const res = await SELECT.one.from(Books).where({ ID: NEW_ID });

      expect(res).to.exist;
      expect(res.title).to.equal("Columns Values Book");
    });

    it("should insert multiple rows via columns().rows() format", async () => {
      const { Books } = cds.entities("bookshop");
      const ID_A = "e0000000-0000-0000-0000-000000000002";
      const ID_B = "e0000000-0000-0000-0000-000000000003";

      // TODO: Testing Insert, we must make sure it does not fail quietly
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
    it("should update a row and return affected row count", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await UPDATE(Books)
        .set({ title: "Updated" })
        .where({ ID: WUTHERING_ID });

      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res.title).to.equal("Updated");
    });

    it("should update by key using UPDATE(entity, key) shorthand", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await UPDATE(Books, WUTHERING_ID).set({
        title: "Key Updated",
      });
      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res.title).to.equal("Key Updated");
    });

    it("should allow updates via .with() instead of .set()", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await UPDATE(Books)
        .with({ title: "With Updated" })
        .where({ ID: RAVEN_ID });
      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: RAVEN_ID });
      expect(res.title).to.equal("With Updated");
    });

    it("should clear a nullable field when set to null", async () => {
      const { Books } = cds.entities("bookshop");

      await UPDATE(Books).set({ genre_ID: null }).where({ ID: WUTHERING_ID });

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res.genre_ID).to.not.exist;
    });
  });

  describe("DELETE", () => {
    it("should delete a row and return affected row count", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await DELETE.from(Books).where({ ID: WUTHERING_ID });
      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res).to.not.exist;
    });

    it("should delete by key using DELETE.from(entity, key) shorthand", async () => {
      const { Books } = cds.entities("bookshop");

      const count = await DELETE.from(Books, ELEONORA_ID);
      expect(count).to.equal(1);

      const res = await SELECT.one.from(Books).where({ ID: ELEONORA_ID });
      expect(res).to.not.exist;
    });
  });

  describe("Books.texts (localized)", () => {
    it("should return all localized rows via direct SELECT", async () => {
      const res = await SELECT.from("bookshop.Books.texts");
      expect(res.length).to.equal(4);
    });

    it("should filter texts by locale", async () => {
      const res = await SELECT.from("bookshop.Books.texts").where({
        locale: "en",
      });
      expect(res.length).to.equal(3);
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

    it("should INSERT a Books.drafts row and return it in a subsequent SELECT", async () => {
      // TODO: Review AI Test
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
        DraftAdministrativeData_DraftUUID: DRAFT_UUID,
      });

      const row = await SELECT.one.from(Books.drafts).where({ ID: NEW_DRAFT_ID });

      expect(row).to.exist;
      expect(row.title).to.equal("Draft Insert Test");
      expect(row.IsActiveEntity).to.equal(false);
      expect(row.DraftAdministrativeData_DraftUUID).to.equal(DRAFT_UUID);
    });

    it("should deep INSERT Books.drafts with nested ExpertReviews.drafts via composition", async () => {
      // TODO: Review AI Test
      const { Books, ExpertReviews } = cds.entities("bookshop");
      const NEW_DRAFT_BOOK_ID   = "dddd0000-0000-0000-0000-000000000003";
      const NEW_DRAFT_REVIEW_ID = "dddd0000-0000-0000-0000-000000000004";
      const DRAFT_UUID          = "dddd0000-0000-0000-0000-000000000005";

      await INSERT.into(Books.drafts).entries({
        ID: NEW_DRAFT_BOOK_ID,
        title: "Deep Draft Insert",
        author_ID: EMILY_ID,
        IsActiveEntity: false,
        HasActiveEntity: false,
        HasDraftEntity: true,
        DraftAdministrativeData_DraftUUID: DRAFT_UUID,
        expertReviews: [{
          ID: NEW_DRAFT_REVIEW_ID,
          book_ID: NEW_DRAFT_BOOK_ID,
          title: "Draft Expert Opinion",
          shortText: "Promising draft.",
          longText: "A review of the draft manuscript.",
          IsActiveEntity: false,
          HasActiveEntity: false,
          HasDraftEntity: true,
          DraftAdministrativeData_DraftUUID: DRAFT_UUID,
        }],
      });

      const book = await SELECT.one.from(Books.drafts).where({ ID: NEW_DRAFT_BOOK_ID });
      expect(book).to.exist;
      expect(book.title).to.equal("Deep Draft Insert");

      const reviews = await SELECT.from(ExpertReviews.drafts).where({ book_ID: NEW_DRAFT_BOOK_ID });
      expect(reviews).to.be.an("array").with.length(1);
      expect(reviews[0].ID).to.equal(NEW_DRAFT_REVIEW_ID);
      expect(reviews[0].title).to.equal("Draft Expert Opinion");
    });
  });

  describe("Genres entity — recursive composition", () => {
    it("should select root Genres with no parent", async () => {
      const { Genres } = cds.entities("bookshop");

      const res = await SELECT.from(Genres).where({ parent_ID: null });

      expect(res.length).to.equal(1);
      expect(res[0].name).to.equal("Fiction");
    });

    it("should expand Genre children one level of recursion", async () => {
      const { Genres } = cds.entities("bookshop");

      const res = await SELECT.from(Genres)
        .where({ ID: FICTION_ID })
        .columns((g) => {
          (g.name, g.children((c) => c.name));
        });

      expect(res.length).to.equal(1);
      expect(res[0].name).to.equal("Fiction");
      expect(res[0].children).to.be.an("array").with.length(2);
      expect(res[0].children.map((c) => c.name).sort()).to.deep.equal([
        "Gothic",
        "Romance",
      ]);
    });

    it("should return inserted child Genre under parent when expanding children", async () => {
      const { Genres } = cds.entities("bookshop");
      const NEW_GENRE_ID = "c0000000-0000-0000-0000-000000000099";

      await INSERT.into(Genres).entries({
        ID: NEW_GENRE_ID,
        name: "Horror",
        parent_ID: FICTION_ID,
      });

      const res = await SELECT.from(Genres)
        .where({ ID: FICTION_ID })
        .columns((g) => {
          (g.name, g.children((c) => c.name));
        });
      expect(res[0].children.map((c) => c.name)).to.include("Horror");
    });
  });

  describe("ExpertReviews entity", () => {
    it("should insert a review and return it in subsequent SELECT", async () => {
      const { ExpertReviews } = cds.entities("bookshop");

      await INSERT.into(ExpertReviews).entries({
        book_ID: RAVEN_ID,
        title: "Poe at his finest",
        shortText: "Brief but brilliant.",
        longText: "A masterclass in suspense and meter.",
      });

      const res = await SELECT.from(ExpertReviews).where({ book_ID: RAVEN_ID });

      expect(res.length).to.equal(1);
      expect(res[0].title).to.equal("Poe at his finest");
    });

    it("should update review title", async () => {
      const { ExpertReviews } = cds.entities("bookshop");

      await UPDATE(ExpertReviews)
        .set({ title: "Updated Title" })
        .where({ ID: REVIEW_ID });

      const res = await SELECT.one.from(ExpertReviews).where({ ID: REVIEW_ID });
      expect(res.title).to.equal("Updated Title");
    });

    it("should delete a review and remove it from subsequent SELECT", async () => {
      const { ExpertReviews } = cds.entities("bookshop");

      await DELETE.from(ExpertReviews).where({ ID: REVIEW_ID });

      const res = await SELECT.one.from(ExpertReviews).where({ ID: REVIEW_ID });
      expect(res).to.not.exist;
    });

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

  describe("Authors.books — unmanaged association", () => {
    it("should expand books of an author via unmanaged back-link", async () => {
      const { Authors } = cds.entities("bookshop");

      const res = await SELECT.from(Authors)
        .where({ ID: POE_ID })
        .columns((a) => {
          (a.name, a.books((b) => b.title));
        });

      expect(res.length).to.equal(1);
      expect(res[0].name).to.equal("Edgar Allan Poe");
      expect(res[0].books).to.have.length(2);
      expect(res[0].books.map((b) => b.title).sort()).to.deep.equal(
        ["Eleonora", "The Raven"],
      );
    });
  });

  describe("Review_Meta nested composition", () => {
    it("should return Review_Meta with seed values via ExpertReviews composition expand", async () => {
      const { ExpertReviews } = cds.entities("bookshop");

      const res = await SELECT.from(ExpertReviews)
        .where({ ID: REVIEW_ID })
        .columns((r) => {
          (r.ID,
            r.reviewMeta((m) => {
              (m.ID, m.rating, m.notes);
            }));
        });

      expect(res.length).to.equal(1);
      expect(res[0].reviewMeta).to.exist;
      expect(res[0].reviewMeta.ID).to.equal(REVIEW_META_ID);
      expect(res[0].reviewMeta.rating).to.equal(5);
      expect(res[0].reviewMeta.notes).to.equal("A landmark in Gothic fiction.");
    });

    it("should support two-step composition write: INSERT ExpertReview then link Review_Meta by FK", async () => {
      const { ExpertReviews, Review_Meta } = cds.entities("bookshop");

      await INSERT.into(ExpertReviews).entries({
        book_ID: RAVEN_ID,
        title: "Poe revisited",
        shortText: "Second look at Poe.",
        longText: "A deeper dive into the dark poetry.",
      });

      const withoutMeta = await SELECT.one
        .from(ExpertReviews)
        .where({ book_ID: RAVEN_ID });
      expect(withoutMeta).to.exist;
      expect(withoutMeta.reviewMeta_ID).to.not.exist;

      await INSERT.into(Review_Meta).entries({
        expertReview_ID: withoutMeta.ID,
        rating: 4,
        notes: "Hauntingly good.",
      });

      const insertedMeta = await SELECT.one
        .from(Review_Meta)
        .where({ expertReview_ID: withoutMeta.ID });
      await UPDATE(ExpertReviews, withoutMeta.ID).set({
        reviewMeta_ID: insertedMeta.ID,
      });

      const withMeta = await SELECT.one
        .from(ExpertReviews)
        .where({ ID: withoutMeta.ID })
        .columns((r) => {
          (r.ID,
            r.reviewMeta((m) => {
              (m.ID, m.rating, m.notes);
            }));
        });
      expect(withMeta.reviewMeta).to.exist;
      expect(withMeta.reviewMeta.rating).to.equal(4);
      expect(withMeta.reviewMeta.notes).to.equal("Hauntingly good.");
    });
  });

  describe("cds.db.run", () => {
    it("should execute SELECT query via explicit cds.db.run()", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await cds.db.run(SELECT.from(Books));

      expect(res).to.be.an("array").with.length(3);
    });
  });

  describe("aggregate queries", () => {
    beforeEach(async () => {
      const { ExpertReviews, Review_Meta } = cds.entities("bookshop");

      await INSERT.into(ExpertReviews).entries([
        {
          ID: REVIEW2_ID,
          book_ID: RAVEN_ID,
          title: "Review 2",
          shortText: "Short 2",
          longText: "Long 2",
        },
        {
          ID: REVIEW3_ID,
          book_ID: ELEONORA_ID,
          title: "Review 3",
          shortText: "Short 3",
          longText: "Long 3",
        },
      ]);

      await INSERT.into(Review_Meta).entries([
        { ID: META2_ID, expertReview_ID: REVIEW2_ID, rating: 3, notes: "Low" },
        { ID: META3_ID, expertReview_ID: REVIEW3_ID, rating: 4, notes: "Mid" },
      ]);
    });

    it("should return total row count via count(*)", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).columns("count(*) as count");

      expect(res.length).to.equal(1);
      expect(Number(res[0].count)).to.equal(3);
    });

    it("should return highest rating via max(rating)", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).columns(
        "max(rating) as maxRating",
      );

      expect(res.length).to.equal(1);
      expect(Number(res[0].maxRating)).to.equal(5);
    });

    it("should return lowest rating via min(rating)", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).columns(
        "min(rating) as minRating",
      );

      expect(res.length).to.equal(1);
      expect(Number(res[0].minRating)).to.equal(3);
    });

    // TODO: Review AI Test
    it("should return sum of all ratings via sum(rating)", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).columns(
        "sum(rating) as sumRating",
      );

      expect(res.length).to.equal(1);
      expect(Number(res[0].sumRating)).to.equal(12);
    });

    it("should return average rating via avg(rating)", async () => {
      const { Review_Meta } = cds.entities("bookshop");

      const res = await SELECT.from(Review_Meta).columns(
        "avg(rating) as avgRating",
      );

      expect(res.length).to.equal(1);
      expect(Number(res[0].avgRating)).to.equal(4);
    });

    it("should filter grouped results with HAVING clause", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .groupBy("author_ID")
        .columns("author_ID")
        .having("count(*) >", 1);

      expect(res.length).to.equal(1);
      expect(res[0].author_ID).to.equal(POE_ID);
    });
  });

  describe("UPSERT", () => {
    it("should update an existing Book when ID matches", async () => {
      const { Books } = cds.entities("bookshop");

      await UPSERT.into(Books).entries({
        ID: WUTHERING_ID,
        title: "Upserted Title",
      });

      const res = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(res).to.exist;
      expect(res.title).to.equal("Upserted Title");
    });

    it("should insert a new Book when no row with matching ID exists", async () => {
      const { Books } = cds.entities("bookshop");
      const NEW_ID = "b0000000-0000-0000-0000-000000000099";

      await UPSERT.into(Books).entries({
        ID: NEW_ID,
        title: "New Upserted Book",
        author_ID: EMILY_ID,
      });

      const res = await SELECT.one.from(Books).where({ ID: NEW_ID });
      expect(res).to.exist;
      expect(res.title).to.equal("New Upserted Book");
    });
  });

  describe("deep write", () => {
    it("should persist Book and nested ExpertReview in a single deep INSERT via composition", async () => {
      // TODO: Review AI Test
      const { Books, ExpertReviews } = cds.entities("bookshop");
      const NEW_BOOK_ID = "eeee0000-0000-0000-0000-000000000001";
      const NEW_REVIEW_ID = "eeee0000-0000-0000-0000-000000000002";

      await INSERT.into(Books).entries({
        ID: NEW_BOOK_ID,
        title: "Deep Write Test Book",
        author_ID: EMILY_ID,
        expertReviews: [{ ID: NEW_REVIEW_ID, title: "An expert opinion", shortText: "Excellent.", longText: "A thorough review." }],
      });

      const book = await SELECT.one.from(Books).where({ ID: NEW_BOOK_ID });
      expect(book).to.exist;
      expect(book.title).to.equal("Deep Write Test Book");

      const reviews = await SELECT.from(ExpertReviews).where({ book_ID: NEW_BOOK_ID });
      expect(reviews).to.be.an("array").with.length(1);
      expect(reviews[0].ID).to.equal(NEW_REVIEW_ID);
      expect(reviews[0].title).to.equal("An expert opinion");
    });

    it("should update Book and nested ExpertReview in a single deep UPDATE via composition", async () => {
      // TODO: Review AI Test
      const { Books, ExpertReviews } = cds.entities("bookshop");

      await UPDATE(Books, WUTHERING_ID).set({
        title: "Updated Heights",
        expertReviews: [{ ID: REVIEW_ID, title: "Updated Review" }],
      });

      const book = await SELECT.one.from(Books).where({ ID: WUTHERING_ID });
      expect(book).to.exist;
      expect(book.title).to.equal("Updated Heights");

      const review = await SELECT.one.from(ExpertReviews).where({ ID: REVIEW_ID });
      expect(review).to.exist;
      expect(review.title).to.equal("Updated Review");
    });

    it("should persist Book and nested ExpertReview in a single deep UPSERT via composition", async () => {
      // TODO: Review AI Test
      const { Books, ExpertReviews } = cds.entities("bookshop");
      const NEW_BOOK_ID = "eeee0000-0000-0000-0000-000000000003";
      const NEW_REVIEW_ID = "eeee0000-0000-0000-0000-000000000004";

      await UPSERT.into(Books).entries({
        ID: NEW_BOOK_ID,
        title: "Deep Upsert Test Book",
        author_ID: EMILY_ID,
        expertReviews: [{ ID: NEW_REVIEW_ID, title: "A fresh take", shortText: "Insightful.", longText: "Very thoughtful." }],
      });

      const book = await SELECT.one.from(Books).where({ ID: NEW_BOOK_ID });
      expect(book).to.exist;
      expect(book.title).to.equal("Deep Upsert Test Book");

      const reviews = await SELECT.from(ExpertReviews).where({ book_ID: NEW_BOOK_ID });
      expect(reviews).to.be.an("array").with.length(1);
      expect(reviews[0].ID).to.equal(NEW_REVIEW_ID);
      expect(reviews[0].title).to.equal("A fresh take");
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

  describe("combination queries", () => {
    it("should return only Poe when combining WHERE, groupBy, and having", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where("author_ID =", POE_ID)
        .groupBy("author_ID")
        .columns("author_ID")
        .having("count(*) >", 0);

      expect(res.length).to.equal(1);
      expect(res[0].author_ID).to.equal(POE_ID);
    });

    it("should return first Poe book alphabetically when combining WHERE IN, orderBy, and limit", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ author_ID: { in: [POE_ID] } })
        .orderBy("title")
        .limit(1);

      expect(res.length).to.equal(1);
      expect(res[0].title).to.equal("Eleonora");
    });

    it("should return expanded author for first Poe book when combining expand, WHERE, orderBy, and limit", async () => {
      const { Books } = cds.entities("bookshop");

      const res = await SELECT.from(Books)
        .where({ author_ID: POE_ID })
        .columns((b) => {
          (b.ID, b.title, b.author((a) => a.name));
        })
        .orderBy("title")
        .limit(1);

      expect(res.length).to.equal(1);
      expect(res[0].title).to.equal("Eleonora");
      expect(res[0].author.name).to.equal("Edgar Allan Poe");
    });
  });
});
