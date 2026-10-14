const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const SMALLEST_LEVEL = 0.5;
const SMALLEST_FIT = 0.2;
const LARGEST_ZOOM = 3;
const CSS_PIXELS_PER_POINT = 96 / 72;

const PANE_SIDE_PADDING = 24;

export function fitZoom(paneWidth: number, pageWidthInPoints: number): number {
  const fit =
    (paneWidth - 2 * PANE_SIDE_PADDING) /
    (pageWidthInPoints * CSS_PIXELS_PER_POINT);
  return Math.min(LARGEST_ZOOM, Math.max(SMALLEST_FIT, fit));
}

export function zoomIn(zoom: number): number {
  return ZOOM_LEVELS.find((level) => level > zoom) ?? zoom;
}

export function zoomOut(zoom: number, fit: number): number {
  return (
    ZOOM_LEVELS.findLast((level) => level < zoom) ??
    Math.min(zoom, SMALLEST_LEVEL, fit)
  );
}

export function pageBefore(pageNumber: number): number {
  return Math.max(1, pageNumber - 1);
}

export function pageAfter(pageNumber: number, pageCount: number): number {
  return Math.min(pageCount, pageNumber + 1);
}
