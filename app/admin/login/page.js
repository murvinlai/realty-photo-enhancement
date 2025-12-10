'use client';

import { useState } from 'react';
import { supabaseAdminClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // 1. Sign in
            const { data: { user, session }, error: signInError } = await supabaseAdminClient.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) throw signInError;

            // 2. Add extra check to see if they are actually an admin
            // We use a server-side API to bypass potentially broken RLS policies on the client
            const verifyResponse = await fetch('/api/admin/check', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!verifyResponse.ok) {
                // Not an admin or error, sign them out immediately
                await supabaseAdminClient.auth.signOut();
                const data = await verifyResponse.json().catch(() => ({}));
                throw new Error(data.error || 'Access denied: Admin privileges required.');
            }

            const verifyData = await verifyResponse.json();
            if (!verifyData.isAdmin) {
                await supabaseAdminClient.auth.signOut();
                throw new Error('Access denied: Admin privileges required.');
            }

            // Success
            router.push('/admin');

        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111827', // Use dark background for admin login
            padding: '2rem'
        }}>
            <div style={{
                maxWidth: '400px',
                width: '100%',
                padding: '2.5rem',
                background: '#1f2937',
                borderRadius: '0.75rem',
                border: '1px solid #374151',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h1 style={{
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: 'white',
                        marginBottom: '0.5rem'
                    }}>
                        Admin Portal
                    </h1>
                    <p style={{ color: '#9ca3af' }}>Restricted Access</p>
                </div>

                {error && (
                    <div style={{
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '0.5rem',
                        color: '#ef4444',
                        fontSize: '0.875rem'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            color: '#d1d5db',
                            fontSize: '0.875rem'
                        }}>
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #374151',
                                background: '#374151',
                                color: 'white',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            color: '#d1d5db',
                            fontSize: '0.875rem'
                        }}>
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #374151',
                                background: '#374151',
                                color: 'white',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '0.875rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            background: '#2563eb', // Blue
                            color: 'white',
                            fontWeight: '600',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            transition: 'background 0.2s'
                        }}
                    >
                        {loading ? 'Authenticating...' : 'Login to Dashboard'}
                    </button>
                </form>
            </div>
        </div>
    );
}
