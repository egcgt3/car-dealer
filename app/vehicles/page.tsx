"use client";
import { useVehicles } from "../lib/vehicles/vehicle-context";

export default function VehiclePage() {
  const { vehicles, isRefreshing, refresh } = useVehicles();

  return (
    <div>
      <h1 className="text-5xl font-bold">Vehicles</h1>
      <p>{vehicles.length} vehicles in inventory</p>
      <ul>
        {vehicles.map((v) => (
          <li key={v.vehicleId}>
            {v.year} {v.make} {v.model} — ${v.price.toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}