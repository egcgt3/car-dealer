"use client";
import { useVehicles } from "../lib/vehicles/vehicle-context";
import VehicleCard from "../components/vehicle-card/VehicleCard";
import CarLogo from "../components/car-logo/CarLogo";

export default function VehiclePage() {
  const { vehicles, searchedVehicles } = useVehicles();

  const displayVehicles = searchedVehicles ?? vehicles;

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl text-center">
        {displayVehicles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <CarLogo className="h-24 w-24 text-primary/60" />
            <h1 className="text-2xl font-bold text-zinc-200">No vehicles found</h1>
            <p className="text-base-content/70">
              We couldn&apos;t find a match. Try a different make, model or year.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-zinc-200">
                  Found {displayVehicles.length} {displayVehicles.length === 1 ? "vehicle" : "vehicles"}
                </h1>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayVehicles.map((v) => (
                <VehicleCard vehicle={v} key={v.vehicleId} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
