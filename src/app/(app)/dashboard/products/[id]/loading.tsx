export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="h-8 w-56 animate-pulse bg-muted" />
      <div className="h-4 w-80 animate-pulse bg-muted" />
      <div className="mt-8 h-64 animate-pulse bg-muted" />
    </div>
  );
}
