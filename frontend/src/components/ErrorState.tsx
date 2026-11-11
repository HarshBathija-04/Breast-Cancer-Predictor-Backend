export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="rounded-md border border-line bg-sunken p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <span className="size-2 shrink-0 rounded-full bg-malignant" aria-hidden />
        {title}
      </p>
      <p className="mt-1 text-ink-soft">{message}</p>
      <button type="button" className="btn btn-ghost mt-3 text-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
