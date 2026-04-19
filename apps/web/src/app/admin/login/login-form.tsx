"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

const loginSchema = z.object({
  user: z.string().trim().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({ serverError }: { serverError?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { user: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = (values: LoginValues) => {
    startTransition(async () => {
      const res = await login(values);
      if (res.ok) {
        toast.success("Sesión iniciada");
        router.push("/admin");
        router.refresh();
      } else {
        toast.error(res.error);
        form.setError("password", { message: res.error });
      }
    });
  };

  const userError = form.formState.errors.user?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {serverError}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="user">Usuario</Label>
        <Input
          id="user"
          autoFocus
          autoComplete="username"
          aria-invalid={Boolean(userError)}
          {...form.register("user")}
        />
        {userError ? (
          <p className="text-[11px] text-destructive">{userError}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(passwordError)}
          {...form.register("password")}
        />
        {passwordError ? (
          <p className="text-[11px] text-destructive">{passwordError}</p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}
