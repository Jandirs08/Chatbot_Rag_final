"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Ha ocurrido un error</h1>
        <p className="text-muted-foreground mb-6">
          {error?.message || "Algo salió mal mientras cargábamos esta página."}
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}