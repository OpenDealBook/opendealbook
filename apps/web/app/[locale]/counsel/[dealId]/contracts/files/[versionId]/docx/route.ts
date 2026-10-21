import { respondWithContractFile } from '../respond';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  return respondWithContractFile((await params).versionId, 'docx');
}
