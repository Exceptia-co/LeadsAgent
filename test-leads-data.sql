-- Test data script to create leads with and without names
-- This will help test the null-safe filtering

-- Lead with name
INSERT INTO leads (id, phone, name, email, status, source) 
VALUES (gen_random_uuid(), '+5491123456789', 'Juan Pérez', 'juan@example.com', 'NUEVO', 'whatsapp');

-- Lead without name (NULL)
INSERT INTO leads (id, phone, name, email, status, source) 
VALUES (gen_random_uuid(), '+5491987654321', NULL, 'anonimo@example.com', 'CONTACTADO', 'whatsapp');

-- Lead with empty string as name (edge case)
INSERT INTO leads (id, phone, name, email, status, source) 
VALUES (gen_random_uuid(), '+5491555666777', '', 'vacio@example.com', 'QUALIFIED', 'whatsapp');

-- More leads with names
INSERT INTO leads (id, phone, name, email, status, moodScore, source) 
VALUES (gen_random_uuid(), '+5491111222333', 'María García', 'maria@example.com', 'GANADO', 0.8, 'whatsapp');

INSERT INTO leads (id, phone, name, email, status, moodScore, source) 
VALUES (gen_random_uuid(), '+5491444555666', 'Carlos López', 'carlos@example.com', 'PERDIDO', 0.3, 'whatsapp');

-- Lead with null name but with moodScore
INSERT INTO leads (id, phone, name, email, status, moodScore, source) 
VALUES (gen_random_uuid(), '+5491777888999', NULL, 'noname@example.com', 'NUEVO', 0.9, 'whatsapp');
