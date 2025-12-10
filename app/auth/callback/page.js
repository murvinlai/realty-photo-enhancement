'use client';

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

function LoadingSpinner({ message }) {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background)'
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: '50px',
                    height: '50px',
                    border: '3px solid var(--border)',
                    borderTop: '3px solid var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 1rem'
                }} />
                <p style={{ color: 'var(--secondary)' }}>{message || 'Loading...'}</p>
            </div>
            <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

function CallbackContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState('Processing login...');

    useEffect(() => {
        const handleCallback = async () => {
            console.log('Auth Callback triggered');

            // Check for errors in URL
            const error = searchParams.get('error');
            const errorDescription = searchParams.get('error_description');
            if (error) {
                console.error('Auth error from providers:', error, errorDescription);
                router.push(`/login?error=${encodeURIComponent(errorDescription || error)}`);
                return;
            }

            const code = searchParams.get('code');
            if (code) {
                setStatus('Exchanging code for session...');
                const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                if (exchangeError) {
                    console.error('Exchange error:', exchangeError);
                    router.push('/login?error=exchange_failed');
                    return;
                }
            }

            // Verify session
            setStatus('Verifying session...');
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (session) {
                console.log('Session active, redirecting...');
                router.push('/');
            } else {
                console.warn('No session found after callback');
                // Wait a moment in case auto-refresh is happening
                setTimeout(async () => {
                    const { data: { session: retrySession } } = await supabase.auth.getSession();
                    if (retrySession) router.push('/');
                    else router.push('/login?error=no_session');
                }, 1000);
            }
        };

        handleCallback();
    }, [router, searchParams]);

    return <LoadingSpinner message={status} />;
}

export default function AuthCallback() {
    return (
        <Suspense fallback={<LoadingSpinner message="Initializing validation..." />}>
            <CallbackContent />
        </Suspense>
    );
}
