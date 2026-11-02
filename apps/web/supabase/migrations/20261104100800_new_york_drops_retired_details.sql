-- New York now loads from the All Filings datasets, where only the address
-- history names a registered agent, CEO or principal executive office. Drop
-- what the retired active-corporations file left, so an entity the address
-- history says nothing about does not keep a stale agent, office or CEO.

update public.state_registry_entity
set registered_agent = null,
  principal_address_line1 = null,
  principal_city = null,
  principal_state = null,
  principal_postal_code = null
where state = 'NY';

delete from public.state_registry_officer
where dataset = 'NY';
