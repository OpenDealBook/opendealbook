import { timeZones } from '@odb/accounts/shared';

export function zoneChoices(current: string | null) {
  return current === null || timeZones.includes(current)
    ? timeZones
    : [current, ...timeZones];
}
