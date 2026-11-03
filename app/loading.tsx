export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-10">
      <div className="h-3 w-28 animate-pulse bg-rule" />
      <div className="mt-4 h-12 w-2/3 max-w-lg animate-pulse bg-rule" />
      <div className="mt-3 h-4 w-1/2 max-w-md animate-pulse bg-rule" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <div key={key} className="h-32 animate-pulse border border-rule bg-paper" />
        ))}
      </div>
    </div>
  );
}
