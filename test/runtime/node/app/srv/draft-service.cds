using { sap.capire.bookshop as my } from '../db/schema';

@path: 'draft'
service DraftService {
  @odata.draft.enabled
  entity Books as projection on my.Books;
  entity Authors as projection on my.Authors;
}
