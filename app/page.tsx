import Hero from "./components/hero/Hero";
import FeaturedVehicles from "./components/featured-vehicles/FeaturedVehicles";
import TechStack from "./components/tech-stack/TechStack";

export default function Home() {
  return (
    <>
      <Hero />
      <FeaturedVehicles />
      <TechStack />
    </>
  );
}
