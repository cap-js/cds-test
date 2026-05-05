namespace bookshop;

entity Authors {
  key ID    : UUID;
      name  : String;
      books : Association to many Books on books.author = $self;
}

entity Books {
  key ID            : UUID;
      title         : localized String;
      author        : Association to Authors;
      genre         : Association to one Genres;
      expertReviews : Composition of many ExpertReviews
                        on expertReviews.book = $self;
}

entity Genres {
  key ID       : UUID;
      name     : String;
      parent   : Association to one Genres;
      children : Composition of many Genres
                   on children.parent = $self;
}

entity ExpertReviews {
  key ID          : UUID;
      book        : Association to one Books;
      title       : String(60);
      shortText   : String(140);
      longText    : String;
      tags        : many String;
      reviewMeta  : Composition of one Review_Meta;
}

entity Review_Meta {
  key ID               : UUID;
      expertReview     : Association to one ExpertReviews;
      rating           : Integer;
      notes            : String;
}
