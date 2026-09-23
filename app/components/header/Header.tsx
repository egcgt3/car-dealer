import  Link from "next/link";

export default function Header() {
  return (
    <div className="navbar bg-base-100 shadow-sm">
      <Link href="/" className="btn btn-ghost text-xl italic text-zinc-400">
        Car Dealership Demo
      </Link>
    </div>
  );
}