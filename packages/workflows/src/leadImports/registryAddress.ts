export const REGISTRY_ADDRESS_COLUMNS =
  'principal_address_line1, principal_city, principal_state, principal_postal_code, mailing_address_line1, mailing_city, mailing_state, mailing_postal_code';

type Block = 'principal' | 'mailing';
type Part = 'address_line1' | 'city' | 'state' | 'postal_code';

export type RegistryAddressColumns = Record<`${Block}_${Part}`, string | null>;

function addressBlock(entity: RegistryAddressColumns, block: Block) {
  return {
    line1: entity[`${block}_address_line1`],
    city: entity[`${block}_city`],
    state: entity[`${block}_state`],
    postalCode: entity[`${block}_postal_code`],
  };
}

export function registryAddress(entity: RegistryAddressColumns) {
  const principal = addressBlock(entity, 'principal');
  return Object.values(principal).some(Boolean)
    ? principal
    : addressBlock(entity, 'mailing');
}
