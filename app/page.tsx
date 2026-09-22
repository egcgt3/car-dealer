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
      <div className="card bg-base-100 w-96 shadow-sm">
        <figure>
          <img
            src="https://img.daisyui.com/images/stock/photo-1606107557195-0e29a4b5b4aa.webp"
            alt="Shoes" />
        </figure>
        <div className="card-body">
          <h2 className="card-title">Card Title</h2>
          <p>A card component has a figure, a body part, and inside body there are title and actions parts</p>
          <div className="card-actions justify-end">
            <button className="btn btn-primary">Buy Now</button>
          </div>
        </div>
      </div>
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
