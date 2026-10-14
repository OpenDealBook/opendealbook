import { pdfAssetResponse } from '@odb/lender-rooms/viewer/pdf-asset-response.ts';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string[] }> },
) {
  const { asset } = await params;
  return pdfAssetResponse(asset);
}
