const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or Service Role Key in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SUPER_ADMIN_EMAIL = 'business@almondtreemedia.ca';
const SUPER_ADMIN_PASSWORD = 'Xuak12Miko..';

async function createSuperAdmin() {
    console.log('Creating Superadmin...');

    // 1. Check if user exists, or create them
    // Note: admin.createUser auto-confirms the user
    const { data: user, error: createError } = await supabase.auth.admin.createUser({
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Super Admin' }
    });

    if (createError) {
        if (createError.message.includes('already registered')) {
            console.log('User already exists. Skipping creation.');
        } else {
            console.error('Error creating user:', createError.message);
            return;
        }
    }

    // Get the user ID (fetch again to be sure if we skipped creation)
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const userData = users.find(u => u.email === SUPER_ADMIN_EMAIL);

    if (!userData) {
        console.error('Could not find superadmin user after creation attempt.');
        return;
    }

    console.log(`User ID: ${userData.id}`);

    // 2. Add to admins table
    const { error: insertError } = await supabase
        .from('admins')
        .insert([
            { id: userData.id, email: SUPER_ADMIN_EMAIL }
        ])
        .select();

    if (insertError) {
        if (insertError.code === '23505') { // Unique violation
            console.log('User is already in admins table.');
        } else if (insertError.code === '42P01') { // Undefined table
            console.error('Error: "admins" table does not exist. Please run the migration SQL first.');
        } else {
            console.error('Error adding to admins table:', insertError);
        }
    } else {
        console.log('Successfully added user to admins table.');
    }
}

createSuperAdmin();
