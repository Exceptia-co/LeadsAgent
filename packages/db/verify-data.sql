-- Verificar que los leads se crearon correctamente
SELECT 
    id, 
    name, 
    phone, 
    email, 
    status, 
    whatsapp_authorized, 
    mood_score, 
    source, 
    created_at 
FROM leads 
ORDER BY created_at DESC;
