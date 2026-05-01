using {bookshop} from '../db/schema';

@path: 'catalog'
service CatalogService {
  entity Authors as projection on bookshop.Authors;

  @odata.draft.enabled
  entity Books   as projection on bookshop.Books;
}
