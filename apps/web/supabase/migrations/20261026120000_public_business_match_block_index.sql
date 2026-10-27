-- The matcher finds candidates by a match_key prefix (postal code and street
-- number); the default collation cannot serve a prefix scan from the unique index.
create index ix_public_business_match_key_prefix on public.public_business (match_key text_pattern_ops);
