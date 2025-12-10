'use client';

import { useEffect, useState } from 'react';
import { supabaseAdminClient } from '@/lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { session } } = await supabaseAdminClient.auth.getSession();

            if (!session) {
                if (pathname !== '/admin/login') {
                    router.push('/admin/login');
                }
                setLoading(false);
                return;
            }

            // Verify admin status via server-side API (bypassing RLS)
            try {
                const verifyResponse = await fetch('/api/admin/check', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (!verifyResponse.ok) {
                    const data = await verifyResponse.json().catch(() => ({}));
                    console.log('Admin verification failed:', data.error);
                    if (pathname !== '/admin/login') {
                        // If they have a session but aren't admin, redirect to home
                        // If session is invalid, maybe redirect to login? 
                        // For now, treat as non-admin -> home
                        router.push('/');
                    }
                    setLoading(false);
                    return;
                }

                const verifyData = await verifyResponse.json();
                if (!verifyData.isAdmin) {
                    if (pathname !== '/admin/login') {
                        router.push('/');
                    }
                    setLoading(false);
                    return;
                }

                setIsAdmin(true);
                setLoading(false);

            } catch (err) {
                console.error('Admin check error:', err);
                if (pathname !== '/admin/login') {
                    router.push('/admin/login');
                }
                setLoading(false);
            }
        };

        checkAdmin();
    }, [router, pathname]);

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--foreground)'
            }}>
                Checking permissions...
            </div>
        );
    }

    // Don't show layout for login page
    if (pathname === '/admin/login') {
        return children;
    }

    if (!isAdmin) {
        return null;
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            {/* Admin Sidebar */}
            <aside style={{
                width: '250px',
                background: '#111827', // Darker background for admin sidebar
                borderRight: '1px solid var(--border)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ marginBottom: '2rem' }}>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: 'bold',
                        color: 'white',
                        marginBottom: '0.25rem'
                    }}>
                        Admin Panel
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Super Admin Access</p>
                </div>

                <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                    <Link href="/admin" style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        background: pathname === '/admin' ? '#374151' : 'transparent',
                        color: pathname === '/admin' ? 'white' : '#d1d5db',
                        textDecoration: 'none',
                        transition: 'all 0.2s'
                    }}>
                        Dashboard
                    </Link>
                    <Link href="/admin/users" style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        background: pathname === '/admin/users' ? '#374151' : 'transparent',
                        color: pathname === '/admin/users' ? 'white' : '#d1d5db',
                        textDecoration: 'none',
                        transition: 'all 0.2s'
                    }}>
                        Users
                    </Link>
                    <Link href="/admin/presets" style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        background: pathname === '/admin/presets' ? '#374151' : 'transparent',
                        color: pathname === '/admin/presets' ? 'white' : '#d1d5db',
                        textDecoration: 'none',
                        transition: 'all 0.2s'
                    }}>
                        Default Presets
                    </Link>
                </nav>

                <button
                    onClick={async () => {
                        await supabaseAdminClient.auth.signOut();
                        router.push('/admin/login');
                    }}
                    style={{
                        marginTop: 'auto',
                        padding: '0.75rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        textAlign: 'center'
                    }}
                >
                    Sign Out
                </button>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '2rem', background: 'var(--background)' }}>
                {children}
            </main>
        </div>
    );
}
