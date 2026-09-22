// Key builders for the single-table design in plans/dynamodb-schema.md.
// Key formats live here and only here — nothing else should hand-format a PK/SK.

export const VEHICLE_SK = "#META";
export const GSI1_ACTIVE_PK = "STATUS#ACTIVE";

export function vehiclePK(vehicleId: string): string {
  return `VEH#${vehicleId}`;
}

export function vinKey(vin: string): string {
  return `VIN#${vin}`;
}

export function userPK(userId: string): string {
  return `USER#${userId}`;
}

export function favoriteSK(vehicleId: string): string {
  return `FAV#${vehicleId}`;
}

export function searchSK(searchId: string): string {
  return `SEARCH#${searchId}`;
}

/** Zero-pads a whole-dollar price to 8 digits so string comparison on GSI1SK sorts numerically. */
export function padPrice(price: number): string {
  return String(Math.round(price)).padStart(8, "0");
}

/** GSI1SK for a vehicle: PRICE#<padded>#<vehicleId>. The trailing id keeps the key unique
 * even when two vehicles share a price. */
export function gsi1SortKey(price: number, vehicleId: string): string {
  return `PRICE#${padPrice(price)}#${vehicleId}`;
}
