'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/update-password`,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            setMessage('Check your email for the password reset link.');
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background)',
            padding: '2rem'
        }}>
            <div className="glass" style={{
                maxWidth: '400px',
                width: '100%',
                padding: '2rem',
                borderRadius: 'var(--radius)'
            }}>
                <h1 style={{
                    fontSize: '2rem',
                    marginBottom: '0.5rem',
                    background: 'linear-gradient(to right, var(--primary), var(--accent))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    Reset Password
                </h1>
                <p style={{ color: 'var(--secondary)', marginBottom: '2rem' }}>
                    Enter your email to receive a reset link
                </p>

                {error && (
                    <div style={{
                        padding: '1rem',
                        marginBottom: '1rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: 'var(--radius)',
                        color: '#ef4444'
                    }}>
                        {error}
                    </div>
                )}

                {message && (
                    <div style={{
                        padding: '1rem',
                        marginBottom: '1rem',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 'var(--radius)',
                        color: '#22c55e'
                    }}>
                        {message}
                    </div>
                )}

                <form onSubmit={handleResetPassword}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            color: 'var(--secondary)',
                            fontSize: '0.9rem'
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
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                background: 'var(--input-bg)',
                                color: 'var(--foreground)'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            borderRadius: 'var(--radius)',
                            border: 'none',
                            background: 'linear-gradient(to right, var(--primary), var(--accent))',
                            color: 'white',
                            fontWeight: '600',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.5 : 1
                        }}
                    >
                        {loading ? 'Sending link...' : 'Send Reset Link'}
                    </button>
                </form>

                <p style={{
                    marginTop: '1.5rem',
                    textAlign: 'center',
                    color: 'var(--secondary)',
                    fontSize: '0.9rem'
                }}>
                    Remember your password?{' '}
                    <a href="/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                        Sign in
                    </a>
                </p>
            </div>
        </div>
    );
}
