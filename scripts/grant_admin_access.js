require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing environment variables.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function grantAdmin() {
    const email = 'business@almondtreemedia.ca';

    console.log(`Granting admin access to ${email}...`);

    // 1. Get User ID
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
        console.error('Error listing users:', listError);
        return;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
        console.error('User not found in auth system!');
        return;
    }

    console.log(`Found user ID: ${user.id}`);

    // 2. Add to admins table
    const { error: insertError } = await supabase
        .from('admins')
        .upsert([
            { id: user.id, email: email }
        ], { onConflict: 'id' })
        .select();

    if (insertError) {
        console.error('Error adding to admins table:', insertError);
    } else {
        console.log('Successfully added user to admins table.');
    }
}

grantAdmin();
