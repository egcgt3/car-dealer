import Link from "next/link";

export default function VehicleNotFound() {
  return (
    <div className="hero py-24">
      <div className="hero-content text-center">
        <div>
          <h1 className="text-4xl font-bold">Vehicle not found</h1>
          <p className="py-6">This vehicle may have been removed or the link is incorrect.</p>
          <Link href="/vehicles" className="btn btn-primary">
            Browse all vehicles
          </Link>
        </div>
      </div>
    </div>
  );
}
