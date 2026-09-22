"use client";

import { useVehicles } from "./lib/vehicles/vehicle-context";

export default function Home() {
  const { vehicles, isRefreshing, refresh } = useVehicles();

  return (
    <>
      <h1>Gerardo&apos;s Car Dealership</h1>
      <p>{vehicles.length} vehicles in inventory</p>
      <button onClick={refresh} disabled={isRefreshing}>
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
      <ul>
        {vehicles.map((v) => (
          <li key={v.vehicleId}>
            {v.year} {v.make} {v.model} — ${v.price.toLocaleString()}
          </li>
        ))}
      </ul>
    </>
  );
}
