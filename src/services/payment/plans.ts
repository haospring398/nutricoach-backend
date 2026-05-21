export type ProPlan = 'pro_monthly' | 'pro_yearly';

// v1 pricing lives in code, not a DB table — change here + redeploy.
// Labels are ASCII-only: PayOS's description field rejects some diacritics.
export const PRO_PLANS: Record<
  ProPlan,
  { priceVnd: number; durationDays: number; label: string }
> = {
  pro_monthly: {
    priceVnd: 99000,
    durationDays: 30,
    label: 'NutriCoach PRO - Hang thang',
  },
  pro_yearly: {
    priceVnd: 899000,
    durationDays: 365,
    label: 'NutriCoach PRO - Hang nam',
  },
};
