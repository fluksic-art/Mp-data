import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Login — MPgenesis Admin" };

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authed = await isAuthenticated();
  if (authed) redirect("/admin");

  const searchParams = await props.searchParams;
  const serverError = searchParams.error ? "Credenciales incorrectas" : undefined;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-editorial px-6">
      <div
        aria-hidden
        className="bg-spotlight-brand pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60"
      />

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="grid size-11 place-items-center rounded-xl bg-primary font-display text-sm font-semibold text-primary-foreground shadow-md">
            M
          </div>
          <p className="text-eyebrow mt-2">Admin</p>
          <h1 className="text-display-md !text-3xl">Bienvenido de vuelta</h1>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Ingresa con tus credenciales para acceder al panel.
          </p>
        </div>

        <div className="mt-8 rounded-2xl bg-card p-6 shadow-lg ring-1 ring-border">
          <LoginForm serverError={serverError} />
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          v0.1.0 · Fase 1
        </p>
      </div>
    </div>
  );
}
