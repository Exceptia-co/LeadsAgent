import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LandingPage } from "./landing-client";

export default async function Home() {
  const { userId } = await auth();

  // Si el usuario esta autenticado, ir al dashboard
  if (userId) {
    redirect("/dashboard");
  }

  // Si no esta autenticado, mostrar landing page
  return <LandingPage />;
}
