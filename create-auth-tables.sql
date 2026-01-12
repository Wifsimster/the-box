create table if not exists "user" (
   id             text primary key,
   email          text not null unique,
   email_verified boolean not null default false,
   name           text not null,
   created_at     timestamp not null default current_timestamp,
   updated_at     timestamp not null default current_timestamp
);

create table if not exists "session" (
   id         text primary key,
   user_id    text not null
      references "user" ( id )
         on delete cascade,
   expires_at timestamp not null,
   token      text not null unique,
   created_at timestamp not null default current_timestamp,
   updated_at timestamp not null default current_timestamp,
   ip_address text,
   user_agent text
);

create table if not exists "account" (
   id            text primary key,
   user_id       text not null
      references "user" ( id )
         on delete cascade,
   account_id    text not null,
   provider_id   text not null,
   access_token  text,
   refresh_token text,
   expires_at    timestamp,
   created_at    timestamp not null default current_timestamp,
   updated_at    timestamp not null default current_timestamp
);

create table if not exists "verification" (
   id         text primary key,
   identifier text not null,
   value      text not null,
   expires_at timestamp not null,
   created_at timestamp not null default current_timestamp,
   updated_at timestamp not null default current_timestamp
);