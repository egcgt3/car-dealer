import type { Vehicle } from "../../lib/vehicles/types";
import { formatEnum, formatExactMileage, formatMpg } from "../../lib/vehicles/format";

export default function KeyFacts({ vehicle }: { vehicle: Vehicle }) {
  const mpg = formatMpg(vehicle.mpgCity, vehicle.mpgHighway);
  const facts = [
    { title: "Mileage", value: formatExactMileage(vehicle.mileage) },
    { title: "Fuel economy", value: mpg ?? "N/A (electric)" },
    { title: "Drivetrain", value: vehicle.drivetrain },
    { title: "Fuel type", value: formatEnum(vehicle.fuelType) },
  ];

  return (
    <div className="stats stats-vertical sm:stats-horizontal w-full shadow-sm border-solid border-1 border-violet-200">
      {facts.map((fact) => (
        <div key={fact.title} className="stat">
          <div className="stat-title">{fact.title}</div>
          <div className="stat-value text-lg">{fact.value}</div>
        </div>
      ))}
    </div>
  );
}
