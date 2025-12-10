import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET(request) {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader) {
        return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a temporary client to verify the user
    // We use the public anon key for this, but we pass the user's token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: { Authorization: `Bearer ${token}` }
        }
    });

    // 1. Verify User
    const { data: { user }, error: authError } = await tempClient.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // 2. Check Admin Status using Service Role (Bypassing RLS)
    const { data: adminData, error: dbError } = await supabaseAdmin
        .from('admins')
        .select('id')
        .eq('id', user.id)
        .single();

    if (dbError && dbError.code !== 'PGRST116') { // PGRST116 is "Row not found"
        console.error('Admin check DB error:', dbError);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!adminData) {
        return NextResponse.json({ isAdmin: false }, { status: 403 });
    }

    return NextResponse.json({ isAdmin: true, userId: user.id });
}
