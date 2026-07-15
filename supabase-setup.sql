-- Executar isso no SQL Editor do Supabase (uma vez só)

create table products (
  id text primary key,
  name text not null,
  material text not null,
  category text not null,
  price numeric not null,
  original_price numeric not null,
  image text,
  letter text,
  featured boolean default false,
  created_at timestamptz default now()
);

-- permite leitura pública (a API pública GET /api/products só lê)
alter table products enable row level security;
create policy "Leitura pública de produtos" on products
  for select using (true);

-- seed inicial com os 14 produtos que já estão no site
insert into products (id, name, material, category, price, original_price, image, letter, featured) values
('cordao-cartier', 'Cordão Cartier', 'Ouro 18k · Elos maciços', 'cordao', 3890, 4590, null, 'C', true),
('alianca-solstice', 'Aliança Solstice', 'Prata 925 · Fosco', 'anel', 1290, 1590, null, 'A', true),
('brinco-etoile', 'Brinco Étoile', 'Ouro 18k · Diamante', 'brinco', 5200, 6200, null, 'B', true),
('pulseira-elo-cubano', 'Pulseira Elo Cubano', 'Ouro 18k · Fecho reforçado', 'pulseira', 2680, 3180, null, 'P', true),
('pulseira-veneziana', 'Pulseira Veneziana', 'Prata 925 · Elos finos', 'pulseira', 1580, 1890, null, 'P', true),
('cordao-grumet', 'Cordão Grumet', 'Ouro 18k · Elo grumet', 'cordao', 4100, 4890, null, 'C', false),
('alianca-cosmos', 'Aliança Cosmos', 'Prata 925 · Zircônia', 'anel', 890, 1090, null, 'A', false),
('brinco-cascade', 'Brinco Cascade', 'Ouro 18k · Safira azul', 'brinco', 6350, 7490, null, 'B', false),
('pingente-stella', 'Pingente Stella', 'Ouro 18k · Diamante', 'pingente', 7900, 9200, null, 'P', false),
('alianca-lattice', 'Aliança Lattice', 'Ouro 18k · Rubi', 'anel', 3200, 3790, null, 'A', false),
('brinco-argola', 'Brinco Argola', 'Prata 925 · Argola lisa', 'brinco', 690, 820, null, 'B', false),
('colar-cruz-cravejada', 'Colar Cruz Cravejada', 'Prata 925 · Zircônia', 'cordao', 990, 1190, 'images/colar-cruz-cravejada.jpg', 'C', false),
('brinco-argola-cravejada', 'Brinco Argola Cravejada', 'Prata 925 · Zircônia', 'brinco', 590, 720, 'images/brinco-argola-cravejada.jpg', 'B', false),
('colar-medalhao-cruz', 'Colar Medalhão Cruz', 'Prata 925 · Zircônia', 'pingente', 890, 1090, 'images/colar-medalhao-cruz.jpg', 'P', false);
