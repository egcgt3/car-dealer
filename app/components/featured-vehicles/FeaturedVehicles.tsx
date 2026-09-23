import { getActiveInventory } from "../../lib/vehicles/repository";
import FeaturedCarousel from "./FeaturedCarousel";

const FEATURED_COUNT = 6;

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    result.push(pool[i]);
  }
  return result;
}

export default async function FeaturedVehicles() {
  const inventory = await getActiveInventory();
  const eligible = inventory.filter((v) => v.dealRating === "GREAT" || v.dealRating === "GOOD");
  const featured = pickRandom(eligible, FEATURED_COUNT);

  if (featured.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1028px] px-4 py-12">
      <h2 className="text-3xl font-bold mb-6">Featured Deals</h2>
      <FeaturedCarousel vehicles={featured} />
    </section>
  );
}
