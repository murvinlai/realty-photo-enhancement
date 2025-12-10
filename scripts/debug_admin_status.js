require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAdminStatus() {
    const email = 'business@almondtreemedia.ca';

    console.log('Checking Auth User...');
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
        console.error('User NOT found in Auth!');
        return;
    }
    console.log(`User ID: ${user.id}`);

    console.log('\nChecking Admins Table...');
    const { data: adminEntry, error: dbError } = await supabase
        .from('admins')
        .select('*')
        .eq('id', user.id);

    if (dbError) {
        console.error('DB Error:', dbError);
    } else if (adminEntry.length === 0) {
        console.error('User is NOT in admins table!');
    } else {
        console.log('User IS in admins table:', adminEntry);
    }
}

checkAdminStatus();
