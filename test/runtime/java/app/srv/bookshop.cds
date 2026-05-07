using {bookshop} from '../db/schema';

@path: 'catalog'
service CatalogService {
  entity Authors as projection on bookshop.Authors;

  @odata.draft.enabled
  entity Books   as projection on bookshop.Books;

  entity Genres        as projection on bookshop.Genres;
  entity ExpertReviews as projection on bookshop.ExpertReviews;
}
