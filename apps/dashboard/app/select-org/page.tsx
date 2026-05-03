import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OrgPicker } from "./org-picker";

export const metadata = {
  title: "Seleccionar organización | LeadsCRM",
};

export default async function SelectOrgPage() {
  const { userId, orgId } = await auth();

  // Sin sesión → /sign-in (defensa en profundidad: el middleware ya lo deja
  // pasar a esta página por estar en isPublicRoute, pero la página decide).
  if (!userId) redirect("/sign-in");

  // Ya tiene org activa → /dashboard (no mostrar selector si no hace falta)
  if (orgId) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-semibold mb-6 text-center">
          Selecciona tu organización
        </h1>
        <OrgPicker />
      </div>
    </div>
  );
}
