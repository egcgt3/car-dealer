"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { refreshActiveInventory } from "./actions";
import type { VehicleCard } from "./types";

interface VehicleContextValue {
  vehicles: VehicleCard[];
  // null = no active search (show everything); [] = a search with no matches.
  searchedVehicles: VehicleCard[] | null;
  setSearchedVehicles: (searchedVehicles: VehicleCard[] | null) => void;
  isRefreshing: boolean;
  refresh: () => void;
}

const VehicleContext = createContext<VehicleContextValue | null>(null);

export function VehicleProvider({
  initialVehicles,
  children,
}: {
  initialVehicles: VehicleCard[];
  children: ReactNode;
}) {
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [searchedVehicles, setSearchedVehicles] = useState<VehicleCard[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      try {
        setVehicles(await refreshActiveInventory());
      } catch (err) {
        // Keep the stale list rather than crashing the tree on a flaky refresh.
        console.error("Failed to refresh vehicle inventory:", err);
      }
    });
  }

  return (
    <VehicleContext.Provider value={{ vehicles, searchedVehicles, setSearchedVehicles, isRefreshing: isPending, refresh }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicles(): VehicleContextValue {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error("useVehicles must be used within a VehicleProvider");
  return ctx;
}
