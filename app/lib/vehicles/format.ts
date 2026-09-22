import type { DealRating } from "./types";

// Loan-payment assumptions for the "$X/mo estimated" line. Display-only placeholders (no
// rate-shopping/lender integration exists) — see plans/dynamodb-schema.md's note that this
// is "computed at render... depends on rate and term" with no concrete values specified.
const DEFAULT_APR = 0.069;
const DEFAULT_TERM_MONTHS = 72;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatPrice(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatMileage(mileage: number): string {
  if (mileage < 1000) return `${mileage} miles`;
  return `${Math.round(mileage / 1000)}k miles`;
}

// Standard amortized-loan monthly payment, $0 down: P * r / (1 - (1+r)^-n)
export function estimateMonthlyPayment(
  price: number,
  apr: number = DEFAULT_APR,
  termMonths: number = DEFAULT_TERM_MONTHS,
): number {
  const monthlyRate = apr / 12;
  if (monthlyRate === 0) return price / termMonths;
  const payment = (price * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  return Math.round(payment);
}

const DEAL_RATING_LABEL: Record<Exclude<DealRating, null>, string> = {
  GREAT: "Great Deal",
  GOOD: "Good Deal",
  FAIR: "Fair Deal",
};

// Traffic-light progression that stays legible on the dark dracula background. badge-error
// stays reserved for actual problems, not just "the worst of three positive labels".
const DEAL_RATING_BADGE_CLASS: Record<Exclude<DealRating, null>, string> = {
  GREAT: "badge-success",
  GOOD: "badge-info",
  FAIR: "badge-warning",
};

export function getDealRatingDisplay(
  dealRating: DealRating,
): { label: string; badgeClass: string } | null {
  if (dealRating === null) return null;
  return { label: DEAL_RATING_LABEL[dealRating], badgeClass: DEAL_RATING_BADGE_CLASS[dealRating] };
}
