import { redirect } from "next/navigation";
import { isAuthenticated, verifyCredentials, createSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Login — MPgenesis Admin" };

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authed = await isAuthenticated();
  if (authed) redirect("/admin");

  const searchParams = await props.searchParams;
  const error = searchParams.error;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            M
          </div>
          <CardTitle className="text-lg">MPgenesis Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={login}>
            <div className="space-y-4">
              {error && (
                <p className="text-center text-sm text-destructive">
                  Credenciales incorrectas
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="user">Usuario</Label>
                <Input id="user" name="user" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Entrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

async function login(formData: FormData) {
  "use server";

  const user = formData.get("user") as string;
  const password = formData.get("password") as string;

  if (!verifyCredentials(user, password)) {
    redirect("/admin/login?error=1");
  }

  await createSession();
  redirect("/admin");
}
