import { convertHtmlToPdf } from './convert-html-to-pdf';
import type {
  BuyerProfile,
  RenderBuyerProfileOptions,
} from './render-buyer-profile-html';
import { renderBuyerProfileHtml } from './render-buyer-profile-html';

// Boundary note: the caller sets includeSensitive only after its own
// permission check; this package renders and does not perform authorization.
export function exportBuyerProfilePdf(
  profile: BuyerProfile,
  options: RenderBuyerProfileOptions = {},
): Promise<Uint8Array> {
  return convertHtmlToPdf(renderBuyerProfileHtml(profile, options));
}
