"use server";

import { getActiveInventory } from "./repository";
import type { VehicleCard } from "./types";

// Used for client-triggered refreshes only (see vehicle-context.tsx). The initial load
// happens directly in app/layout.tsx's server render, not through this action.
export async function refreshActiveInventory(): Promise<VehicleCard[]> {
  return getActiveInventory();
}
