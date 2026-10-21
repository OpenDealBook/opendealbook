export const SELLER_DELIVERY_ATTEMPTS = 5;

export function sellerDeliveryFailedMessage(seller: {
  recipientName: string;
  recipientEmail: string;
}): string {
  return `${seller.recipientName} (${seller.recipientEmail}) did not get the document you sent. Delivery failed after ${SELLER_DELIVERY_ATTEMPTS} attempts.`;
}
