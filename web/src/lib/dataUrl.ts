/**
 * URL of a file in the app's data folder.
 * Always built from BASE_URL: the live link is served from /mareekh/, so a bare /data/... breaks there.
 */
export function dataUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}data/jezero/${fileName}`
}
