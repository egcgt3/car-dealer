export default function VehicleDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="skeleton h-5 w-64" />
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <div className="skeleton aspect-3/2 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-48 w-full" />
        </div>
        <div className="skeleton h-96 w-full" />
      </div>
    </div>
  );
}
