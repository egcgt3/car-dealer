import Image from "next/image";
import Link from "next/link";

export default function Hero() {
  return (
    <div className="hero bg-base-200 h-full">
      <div className="hero-content flex-col lg:flex-row-reverse">
        <Image
          alt="A car ready for sale on the dealership lot"
          src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80"
          width={800}
          height={533}
          priority
          className="max-w-sm rounded-lg shadow-2xl"
        />
        <div>
          <h1 className="text-5xl font-bold">Find Your Next Car Today</h1>
          <p className="py-6">
            Browse new, used, and certified vehicles at unbeatable prices. Every car comes
            with a transparent history and a team ready to help you drive away happy.
          </p>
          <Link href="/vehicles" className="btn btn-primary">
            View All Vehicles
          </Link>
        </div>
      </div>
    </div>
  );
}
