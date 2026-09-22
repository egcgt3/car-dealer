

import { useVehicles } from "./lib/vehicles/vehicle-context";
import Hero from "./components/hero/Hero";

export default function Home() {
  const { vehicles, isRefreshing, refresh } = useVehicles();

  return (
    <>
      <Hero />
    </>
  );
}
