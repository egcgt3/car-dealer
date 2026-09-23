import Link from "next/link";

export default function Breadcrumbs({ vehicleName }: { vehicleName: string }) {
  return (
    <div className="breadcrumbs text-sm">
      <ul>
        <li>
          <Link href="/">Home</Link>
        </li>
        <li>
          <Link href="/vehicles">Vehicles</Link>
        </li>
        <li>{vehicleName}</li>
      </ul>
    </div>
  );
}
