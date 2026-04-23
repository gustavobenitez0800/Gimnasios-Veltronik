require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    console.log('URL defined:', !!supabaseUrl);
    console.log('Key defined:', !!supabaseKey);
    
    if (!supabaseUrl) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const gym_id = 'e69a9e3a-e95e-4c8a-86be-8f8101683d7f'; // Any valid UUID format

    const { data, error } = await supabase
        .from('gyms')
        .select('id, name, plan_id, organization_type')
        .limit(1);

    console.log('Query result:', { data, error });
}

test();
