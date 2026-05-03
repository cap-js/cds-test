namespace bookshop;

entity Authors {
  key ID   : UUID;
      name : String;
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
  key ID        : UUID;
      book      : Association to one Books;
      title     : String(60);
      shortText : String(140);
      longText  : String;
}
