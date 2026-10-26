export function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-48 place-items-center border border-dashed p-6 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
