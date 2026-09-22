import  Link from "next/link";

export default function Header() {
  return (
    <div className="navbar bg-base-100 shadow-sm">
      <Link href="/" className="btn btn-ghost text-xl">
        Gerardo&apos;s Car Dealership
      </Link>
    </div>
  );
}