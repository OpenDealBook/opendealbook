export const timeZones = ['UTC', ...Intl.supportedValuesOf('timeZone')];

export function zoneChoices(current: string | null) {
  return current === null || timeZones.includes(current)
    ? timeZones
    : [current, ...timeZones];
}
