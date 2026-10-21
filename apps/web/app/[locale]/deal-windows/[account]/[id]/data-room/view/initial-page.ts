export function initialPage(param: string | undefined): number {
  return param !== undefined && /^[1-9]\d*$/.test(param) ? Number(param) : 1;
}
