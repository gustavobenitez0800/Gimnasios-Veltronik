require('dotenv').config({ path: '.env.migration' });
const { Client } = require('pg');

async function migrate() {
    console.log("🚀 Iniciando migración de V1 a V2...");
    
    if (!process.env.OLD_DB_URL || !process.env.NEW_DB_URL) {
        console.error("❌ ERROR: Faltan las URLs de la base de datos en .env.migration");
        process.exit(1);
    }

    const oldDb = new Client({ connectionString: process.env.OLD_DB_URL });
    const newDb = new Client({ connectionString: process.env.NEW_DB_URL });

    try {
        await oldDb.connect();
        await newDb.connect();
        console.log("✅ Conexiones a bases de datos establecidas.");

        // 1. Migrar Gimnasios -> Tenants
        console.log("📦 Migrando gimnasios (gyms -> tenant)...");
        const { rows: gyms } = await oldDb.query('SELECT * FROM gyms');
        
        for (const gym of gyms) {
            // Mapeo: gyms -> tenant
            // type defaults to 'GYM'
            // status -> active boolean
            const isActive = gym.status === 'active';
            const trialEndsAt = gym.trial_ends_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            await newDb.query(`
                INSERT INTO tenant (id, name, business_type, address, phone, email, logo_url, is_active, trial_ends_at, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING
            `, [
                gym.id, 
                gym.name, 
                'GYM', 
                gym.address || null, 
                gym.phone || null, 
                gym.email || null, 
                gym.logo_url || null, 
                isActive, 
                trialEndsAt, 
                gym.created_at || new Date(), 
                gym.updated_at || new Date()
            ]);
        }
        console.log(`✅ ${gyms.length} gimnasios migrados exitosamente.`);

        // 2. Migrar Miembros -> members
        console.log("📦 Migrando miembros (members -> members)...");
        const { rows: members } = await oldDb.query('SELECT * FROM members');
        
        for (const member of members) {
            // Split full_name into first_name and last_name
            const nameParts = (member.full_name || 'Sin Nombre').split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || ' ';

            // If attendance_days is an array, join it, or store as JSON string
            const attendanceDays = Array.isArray(member.attendance_days) ? member.attendance_days.join(',') : null;
            
            await newDb.query(`
                INSERT INTO members (id, tenant_id, first_name, last_name, document, email, phone, membership_start, membership_end, business_type, is_active, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO NOTHING
            `, [
                member.id,
                member.gym_id,
                firstName,
                lastName,
                member.dni || null,
                member.email || null,
                member.phone || null,
                member.membership_start || null,
                member.membership_end || null,
                'GYM',
                member.status === 'active' || member.status === 'activo',
                member.created_at || new Date(),
                member.updated_at || new Date()
            ]);
        }
        console.log(`✅ ${members.length} alumnos migrados exitosamente.`);

        // 3. Migrar Pagos -> payments
        console.log("📦 Migrando pagos (member_payments -> payments)...");
        const { rows: payments } = await oldDb.query('SELECT * FROM member_payments');
        
        for (const payment of payments) {
            await newDb.query(`
                INSERT INTO payments (id, tenant_id, member_id, amount, payment_date, payment_method, status, description, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO NOTHING
            `, [
                payment.id,
                payment.gym_id,
                payment.member_id,
                payment.amount || 0,
                payment.payment_date || new Date(),
                payment.payment_method || 'CASH',
                payment.status || 'completed',
                payment.notes || null,
                payment.created_at || new Date(),
                payment.created_at || new Date()
            ]);
        }
        console.log(`✅ ${payments.length} pagos migrados exitosamente.`);

        // 4. Migrar Clases -> gym_class
        console.log("📦 Migrando clases (classes -> gym_class)...");
        const { rows: classes } = await oldDb.query('SELECT * FROM classes');
        
        for (const cls of classes) {
            await newDb.query(`
                INSERT INTO gym_class (id, tenant_id, name, description, instructor, capacity)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING
            `, [
                cls.id,
                cls.gym_id,
                cls.name,
                cls.description || null,
                cls.instructor || null,
                cls.capacity || 20
            ]);
        }
        console.log(`✅ ${classes.length} clases migradas exitosamente.`);

        // 5. Migrar Reservas -> class_booking
        console.log("📦 Migrando reservas (class_bookings -> class_booking)...");
        const { rows: bookings } = await oldDb.query('SELECT * FROM class_bookings');
        
        for (const booking of bookings) {
            await newDb.query(`
                INSERT INTO class_booking (id, tenant_id, class_id, member_id, booking_date, status)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING
            `, [
                booking.id,
                booking.gym_id,
                booking.class_id,
                booking.member_id,
                booking.booking_date || new Date(),
                booking.status || 'confirmed'
            ]);
        }
        console.log(`✅ ${bookings.length} reservas migradas exitosamente.`);


        console.log("🎉 MIGRACIÓN COMPLETADA EXITOSAMENTE! 🎉");

    } catch (error) {
        console.error("❌ Ocurrió un error durante la migración:", error);
    } finally {
        await oldDb.end();
        await newDb.end();
    }
}

migrate();
