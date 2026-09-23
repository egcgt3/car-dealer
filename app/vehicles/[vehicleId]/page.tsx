import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVehicleById } from "../../lib/vehicles/repository";
import {
  daysSince,
  estimateMonthlyPayment,
  formatDate,
  formatEnum,
  formatExactMileage,
  formatMpg,
  formatPrice,
} from "../../lib/vehicles/format";
import Breadcrumbs from "../../components/vehicle-detail/Breadcrumbs";
import PhotoGallery from "../../components/vehicle-detail/PhotoGallery";
import PricePanel from "../../components/vehicle-detail/PricePanel";
import KeyFacts from "../../components/vehicle-detail/KeyFacts";
import SpecSection from "../../components/vehicle-detail/SpecSection";

// Drafts are never public; SOLD/PENDING stay viewable so shared links keep working.
async function loadVehicle(vehicleId: string) {
  const vehicle = await getVehicleById(vehicleId);
  return vehicle && vehicle.status !== "DRAFT" ? vehicle : null;
}

export async function generateMetadata(props: PageProps<"/vehicles/[vehicleId]">): Promise<Metadata> {
  const { vehicleId } = await props.params;
  const vehicle = await loadVehicle(vehicleId);
  if (!vehicle) return { title: "Vehicle not found" };

  return {
    title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
    description: `${formatPrice(vehicle.price)} · ${formatExactMileage(vehicle.mileage)}`,
  };
}

export default async function VehicleDetailPage(props: PageProps<"/vehicles/[vehicleId]">) {
  const { vehicleId } = await props.params;
  const vehicle = await loadVehicle(vehicleId);
  if (!vehicle) notFound();

  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const photos = [...vehicle.photos].sort((a, b) => a.order - b.order);
  const savingsVsMsrp = vehicle.msrp - vehicle.price;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <Breadcrumbs vehicleName={name} />
      <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6 lg:row-span-2">
          <PhotoGallery photos={photos} title={name} />
          <div className="lg:hidden">
            <PricePanel vehicle={vehicle} />
          </div>
          <KeyFacts vehicle={vehicle} />

          <SpecSection
            title="Overview"
            rows={[
              { label: "Condition", value: formatEnum(vehicle.condition) },
              { label: "Body style", value: formatEnum(vehicle.bodyStyle) },
              { label: "Mileage", value: formatExactMileage(vehicle.mileage) },
              { label: "Stock number", value: vehicle.stockNumber },
              { label: "VIN", value: <span className="font-mono text-sm">{vehicle.vin}</span> },
              { label: "Seating", value: `${vehicle.seating} seats` },
              { label: "Keys included", value: vehicle.numberOfKeys },
            ]}
          />
          <SpecSection
            title="Pricing"
            rows={[
              { label: "Price", value: formatPrice(vehicle.price) },
              { label: "MSRP", value: formatPrice(vehicle.msrp) },
              { label: "Savings vs. MSRP", value: savingsVsMsrp > 0 ? formatPrice(savingsVsMsrp) : null },
              { label: "Previous price", value: vehicle.previousPrice !== null ? formatPrice(vehicle.previousPrice) : null },
              { label: "Factory upgrades", value: vehicle.factoryUpgrades > 0 ? formatPrice(vehicle.factoryUpgrades) : null },
              {
                label: "Estimated payment",
                value: `${formatPrice(estimateMonthlyPayment(vehicle.price))}/mo (6.9% APR, 72 mo, $0 down)`,
              },
            ]}
          />
          <SpecSection
            title="Performance & Fuel"
            rows={[
              { label: "Engine", value: vehicle.engine },
              { label: "Cylinders", value: vehicle.engineCylinders },
              { label: "Displacement", value: vehicle.engineDisplacement !== null ? `${vehicle.engineDisplacement} L` : null },
              { label: "Transmission", value: `${vehicle.transmission} (${formatEnum(vehicle.transmissionType)})` },
              { label: "Drivetrain", value: formatEnum(vehicle.drivetrain) },
              { label: "Fuel type", value: formatEnum(vehicle.fuelType) },
              { label: "Fuel economy", value: formatMpg(vehicle.mpgCity, vehicle.mpgHighway) },
            ]}
          />
          <SpecSection
            title="Exterior & Interior"
            rows={[
              { label: "Exterior color", value: vehicle.exteriorColor },
              { label: "Color family", value: formatEnum(vehicle.exteriorColorFamily) },
              { label: "Interior color", value: vehicle.interiorColor },
              { label: "Interior material", value: formatEnum(vehicle.interiorMaterial) },
            ]}
          />
          <SpecSection
            title="Listing details"
            rows={[
              { label: "Status", value: formatEnum(vehicle.status) },
              { label: "Listed", value: `${formatDate(vehicle.listedAt)} (${daysSince(vehicle.listedAt)} days ago)` },
              { label: "Sold", value: vehicle.soldAt ? formatDate(vehicle.soldAt) : null },
              { label: "Last updated", value: formatDate(vehicle.updatedAt) },
            ]}
          />
        </div>
        <div className="hidden lg:block">
          <PricePanel vehicle={vehicle} />
        </div>
      </div>
    </div>
  );
}
