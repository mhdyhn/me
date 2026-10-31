import { api, ApiError } from './api';

export interface SubscriptionState {
  priceTomans: number;
  active: boolean;
  expiresAt: string | null;
  daysLeft: number;
  referralCoachName: string | null;
  cardTransferAvailable: boolean;
}

export interface SubscriptionCheckoutDetails {
  authority: string;
  priceTomans: number;
  transferAmountTomans: number;
  reference: string;
  cardNumber: string;
  cardHolder: string;
  expiresAt: string;
  instructions: string[];
}

/** The subscription of the signed-in user; the smart features are open when `active` is true. */
export async function loadSubscription(): Promise<SubscriptionState | null> {
  try {
    const response = await api<SubscriptionState>('GET', '/me/subscription');
    if (!response || typeof response.priceTomans !== 'number') return null;
    return response;
  } catch {
    return null;
  }
}

/** Starts the card-to-card purchase of one subscription month. */
export async function startSubscriptionCheckout(): Promise<SubscriptionCheckoutDetails> {
  const response = await api<SubscriptionCheckoutDetails>('POST', '/me/subscription/checkout');
  if (!response || typeof response.authority !== 'string' || !/^[A-Za-z0-9_-]{5,100}$/.test(response.authority) ||
      !Number.isSafeInteger(response.transferAmountTomans) || response.transferAmountTomans <= 0 ||
      typeof response.cardNumber !== 'string' || !/^\d{16}$/.test(response.cardNumber)) {
    throw new Error('Invalid subscription checkout');
  }
  return response;
}

/** Sends the bank receipt; the server confirms it automatically. */
export async function submitSubscriptionReceipt(
  authority: string,
  trackingNumber: string,
  senderCardLast4?: string
): Promise<{ success: boolean; message: string; state: SubscriptionState }> {
  const response = await api<{ success: boolean; message: string; state: SubscriptionState }>(
    'POST',
    '/me/subscription/receipt',
    { authority, trackingNumber, ...(senderCardLast4 ? { senderCardLast4 } : {}) }
  );
  if (!response || response.success !== true) {
    throw new ApiError(409, response?.message ?? 'رسید واریزی تأیید نشد.');
  }
  return response;
}
