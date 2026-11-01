export const REGISTRY_LOCATION_COLUMNS =
  'principal_address_line1, principal_city, principal_state, principal_postal_code, mailing_city, mailing_state';

type RegistryLocationColumns = Record<
  | 'principal_address_line1'
  | 'principal_city'
  | 'principal_state'
  | 'principal_postal_code'
  | 'mailing_city'
  | 'mailing_state',
  string | null
>;

export function registryLocation(entity: RegistryLocationColumns) {
  const listed = [
    entity.principal_address_line1,
    entity.principal_city,
    entity.principal_state,
    entity.principal_postal_code,
  ].some(Boolean);
  return listed
    ? { city: entity.principal_city, state: entity.principal_state }
    : { city: entity.mailing_city, state: entity.mailing_state };
}
