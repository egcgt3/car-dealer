import  Link from "next/link";
import Search from "../search/Search";
import CarLogo from "../car-logo/CarLogo";

export default function Header() {
  return (
    <div className="navbar bg-base-100 shadow-sm">
      <div className="flex-1">
        <Link href="/" className="btn btn-ghost gap-2 text-xl italic text-zinc-400">
          <CarLogo className="h-8 w-8 text-primary" />
          <span className="hidden sm:inline">Car Dealer Demo</span>
        </Link>
      </div>
      <Search />
    </div>
  );
}
