"use client";

import { useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVehicles } from "../../lib/vehicles/vehicle-context";

export default function Search() {
  const [searchTerm, setSearchTerm] = useState("");
  const { vehicles, setSearchedVehicles } = useVehicles();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const handleSearch = useCallback((searchTerm: string) => {
    setSearchTerm(searchTerm);
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter((word) => word !== "");
    if (searchWords.length === 0) {
      setSearchedVehicles(null);
      return;
    }

    // Every word must match somewhere in the vehicle ("2018 mazda" -> 2018 Mazdas only);
    // a word can match any of year, make, model, trim or body style.
    const filteredVehicles = vehicles.filter((vehicle) => {
      const haystack = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.bodyStyle]
        .join(" ")
        .toLowerCase();
      return searchWords.every((word) => haystack.includes(word));
    });
    setSearchedVehicles(filteredVehicles);

    // Results only render on the grid page, so searching from anywhere else takes you there.
    if (pathname !== "/vehicles") router.push("/vehicles");
  }, [vehicles, setSearchedVehicles, pathname, router]);

  return (
    <div className="relative flex px-5">
      <input
        ref={inputRef}
        placeholder="Search available vehicles..."
        className="input w-xs pr-9"
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
      />
      {searchTerm !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          className="btn btn-ghost btn-circle btn-xs absolute right-7 top-1/2 -translate-y-1/2"
          onClick={() => {
            handleSearch("");
            inputRef.current?.focus();
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
