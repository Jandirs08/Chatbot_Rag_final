export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Página no encontrada</h1>
        <p className="text-muted-foreground mb-6">
          La ruta que intentaste abrir no existe.
        </p>
        <a
          href="/"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}