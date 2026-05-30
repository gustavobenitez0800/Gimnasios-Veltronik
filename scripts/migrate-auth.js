require('dotenv').config({ path: '.env.migration' });
const { Client } = require('pg');
const crypto = require('crypto');

const authUsers = [
  {
    "id": "96979c70-a2a8-438a-8022-862beec9f7f5",
    "email": "gustavobenitez0800@gmail.com",
    "encrypted_password": "$2a$10$N8koZqjKeVCrcyReboIKt.B8EnCbY95ttiMnOkyVOdxGYCsYVV0zm"
  },
  {
    "id": "b6c3c838-41e8-41c1-9134-2be22f2b5551",
    "email": "mendezfedericoagustin07@gmail.com",
    "encrypted_password": "$2a$10$zsz2gKLEk72P6UCulnMz.eo..u99i4MGQ9f09WBhmbsfNkauCT/Xq"
  },
  {
    "id": "82114a71-4852-4dac-96c2-cd8c7bf8675b",
    "email": "jayavo7345@fun4k.com",
    "encrypted_password": "$2a$10$A4C99ZKGzspxi4mXnP7EYezQiq9d6rBn7A03eneF7PncH2m95AFci"
  },
  {
    "id": "a81cde74-ee37-4df3-8a8b-db8805e977eb",
    "email": "lu7elp@yahoo.com.ar",
    "encrypted_password": "$2a$10$KoRRDIxSjaadN26qb6SXDOwLafIi86AOClqar5Y2BE7cnTEEnlKEG"
  }
];

async function migrateAuth() {
    console.log("🔐 Iniciando migración de credenciales seguras...");
    
    if (!process.env.NEW_DB_URL) {
        console.error("❌ ERROR: Falta NEW_DB_URL en .env.migration");
        process.exit(1);
    }

    const newDb = new Client({ connectionString: process.env.NEW_DB_URL });

    try {
        await newDb.connect();
        
        for (const user of authUsers) {
            console.log(`Procesando usuario: ${user.email}`);
            
            // 1. Insert into app_user
            await newDb.query(`
                INSERT INTO app_user (id, email, password_hash, created_at, updated_at)
                VALUES ($1, $2, $3, NOW(), NOW())
                ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
            `, [user.id, user.email, user.encrypted_password]);

            // 2. Try to find their tenant by email (if they registered the gym with the same email)
            // or by mapping from the old V1. Let's just find the tenant that has this email
            const { rows: tenants } = await newDb.query(`SELECT id FROM tenant WHERE email = $1`, [user.email]);
            
            if (tenants.length > 0) {
                const tenantId = tenants[0].id;
                const membershipId = crypto.randomUUID();
                
                await newDb.query(`
                    INSERT INTO tenant_membership (id, user_id, tenant_id, role, is_active, created_at, updated_at)
                    VALUES ($1, $2, $3, 'OWNER', true, NOW(), NOW())
                    ON CONFLICT (user_id, tenant_id) DO NOTHING
                `, [membershipId, user.id, tenantId]);
                
                console.log(`✅ Vinculado como OWNER al tenant ${tenantId}`);
            } else {
                // Si el email del dueño no coincide con el email del gimnasio, intentaremos forzar la vinculación
                console.log(`⚠️ No se encontró un gimnasio con el email ${user.email}. Se debe vincular manualmente.`);
            }
        }
        
        console.log("🎉 MIGRACIÓN DE CONTRASEÑAS COMPLETADA EXITOSAMENTE! 🎉");

    } catch (error) {
        console.error("❌ Ocurrió un error:", error);
    } finally {
        await newDb.end();
    }
}

migrateAuth();
