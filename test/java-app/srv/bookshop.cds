namespace bookshop;

entity Books {
  key ID    : Integer;
      title : String;
}

@path: 'catalog'
service CatalogService {
  @readonly entity Books as projection on bookshop.Books;
}
