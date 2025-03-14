using { sap.capire.bookshop as my } from '../db/schema';

@path: 'catalog'
service CatalogService {

  /** For displaying lists of Books */
  @readonly entity ListOfBooks as projection on Books
  excluding { descr };

  /** For display in details pages */
  @readonly entity Books as projection on my.Books { *,
    author.name as author
  } excluding { createdBy, modifiedBy };

  // @requires: 'authenticated-user'
  action submitOrder ( book: Books:ID, amount: Integer ) returns { stock: Integer };
  event OrderedBook : { book: Books:ID; amount: Integer; buyer: String };
}
