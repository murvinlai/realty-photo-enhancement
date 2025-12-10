import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        // Test database connection
        const { data, error } = await supabase
            .from('enhancement_presets')
            .select('count');

        if (error) {
            // If table doesn't exist yet, that's okay
            if (error.code === '42P01') {
                return NextResponse.json({
                    success: true,
                    message: 'Supabase connected! Database schema not created yet.',
                    note: 'Run the SQL schema script in Supabase SQL Editor'
                });
            }
            throw error;
        }

        return NextResponse.json({
            success: true,
            message: 'Supabase connected successfully!',
            profileCount: data?.[0]?.count || 0
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error.message,
            details: 'Check your Supabase credentials in .env.local'
        }, { status: 500 });
    }
}
