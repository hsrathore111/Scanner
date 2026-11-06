import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { PRO_ENTITLEMENT, REPORT_PRODUCT_ID, REVENUECAT_API_KEY } from '@/constants/config';

let configured = false;

export function purchasesAvailable(): boolean {
  return Platform.OS !== 'web' && !!REVENUECAT_API_KEY;
}

export async function configurePurchases(appUserID: string) {
  if (!purchasesAvailable()) return;
  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    // The Firebase uid is the RevenueCat app user id, so the backend can check entitlements by uid.
    Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID });
    configured = true;
  } else {
    await Purchases.logIn(appUserID).catch(() => {});
  }
}

export function isPro(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[PRO_ENTITLEMENT];
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  return Purchases.getCustomerInfo();
}

export function onCustomerInfo(cb: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => {};
  Purchases.addCustomerInfoUpdateListener(cb);
  return () => Purchases.removeCustomerInfoUpdateListener(cb);
}

export async function getSubscriptionPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function getReportProduct(): Promise<PurchasesStoreProduct | null> {
  if (!configured) return null;
  const [product] = await Purchases.getProducts([REPORT_PRODUCT_ID], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  return product ?? null;
}

export type PurchaseOutcome = { ok: true; info: CustomerInfo } | { ok: false; cancelled: boolean; message: string };

function toOutcome(err: unknown): PurchaseOutcome {
  const e = err as { code?: string; userCancelled?: boolean | null; message?: string };
  const cancelled = e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || !!e?.userCancelled;
  return { ok: false, cancelled, message: cancelled ? '' : e?.message ?? 'Purchase failed.' };
}

export async function buyPackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, info: customerInfo };
  } catch (err) {
    return toOutcome(err);
  }
}

export async function buyProduct(product: PurchasesStoreProduct): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchaseStoreProduct(product);
    return { ok: true, info: customerInfo };
  } catch (err) {
    return toOutcome(err);
  }
}

export async function restore(): Promise<PurchaseOutcome> {
  try {
    return { ok: true, info: await Purchases.restorePurchases() };
  } catch (err) {
    return toOutcome(err);
  }
}
