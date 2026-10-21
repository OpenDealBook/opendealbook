import { respondWithContractFile } from '~/app/[locale]/counsel/[dealId]/contracts/files/[versionId]/respond';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  return respondWithContractFile((await params).versionId, 'pdf');
}
