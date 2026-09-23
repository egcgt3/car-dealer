"use client";
import { useVehicles } from "../lib/vehicles/vehicle-context";
import VehicleCard from "../components/vehicle-card/VehicleCard";

export default function VehiclePage() {
  const { vehicles, isRefreshing, refresh } = useVehicles();

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl text-center">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{vehicles.length} vehicles in inventory</h1>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={refresh} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {vehicles.map((v) => (
            <VehicleCard vehicle={v} key={v.vehicleId} />
          ))}
        </div>
      </div>
    </div>
  );
}
