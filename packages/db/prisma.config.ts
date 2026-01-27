import path from "path";
import { defineConfig } from "prisma/config";
import { config } from "dotenv";

// Cargar variables de entorno desde el .env raíz del proyecto
config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
});
