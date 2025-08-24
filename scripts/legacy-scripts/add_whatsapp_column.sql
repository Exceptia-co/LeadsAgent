-- Agregar columna whatsappAuthorized a la tabla leads
ALTER TABLE leads ADD COLUMN "whatsappAuthorized" BOOLEAN DEFAULT FALSE;

-- Actualizar algunos leads existentes para testing
UPDATE leads SET "whatsappAuthorized" = TRUE WHERE id IN (
  SELECT id FROM leads LIMIT 2
);

-- Verificar que se agregó correctamente
SELECT id, name, phone, "whatsappAuthorized" FROM leads;
