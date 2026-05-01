namespace bookshop;

entity Authors {
  key ID   : Integer;
      name : String;
}

entity Books {
  key ID     : Integer;
      title  : localized String;
      author : Association to Authors;
}
