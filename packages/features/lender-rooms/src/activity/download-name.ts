// storage-js runs a download name through URLSearchParams and then encodeURI, encoding it
// twice, so URLs are signed with `download: true` and named here.
export function withDownloadName(signedUrl: string, name: string): string {
  return signedUrl.replace(
    /&download=$/,
    `&download=${encodeURIComponent(name)}`,
  );
}
