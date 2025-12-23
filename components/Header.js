'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useNotification } from '@/contexts/NotificationContext';

export default function Header({ onOpenPresets }) {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [showMenu, setShowMenu] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const { addNotification } = useNotification();
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await signOut();
        router.push('/login');
    };

    const handleClearStorage = async () => {
        if (!window.confirm('Are you sure you want to clear all uploaded and processed photos? This cannot be undone.')) {
            return;
        }

        setIsClearing(true);
        try {
            const response = await fetch('/api/admin/clear-storage', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                addNotification('Storage cleared successfully', 'success');
                // Optionally reload or reset state if needed
                window.location.reload();
            } else {
                throw new Error(data.error || 'Failed to clear storage');
            }
        } catch (error) {
            console.error('Clear storage error:', error);
            addNotification(error.message || 'Failed to clear storage', 'error');
        } finally {
            setIsClearing(false);
            setShowMenu(false);
        }
    };

    if (!user) return null;

    // Get user initials for avatar
    const getInitials = () => {
        if (user.user_metadata?.full_name) {
            return user.user_metadata.full_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
        }
        return user.email?.[0]?.toUpperCase() || '?';
    };

    return (
        <header style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(10px)',
            position: 'sticky',
            top: 0,
            zIndex: 100
        }}>
            <div style={{
                maxWidth: '1400px',
                margin: '0 auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <h1 style={{
                        fontSize: '1.25rem',
                        fontWeight: '700',
                        background: 'linear-gradient(to right, var(--primary), var(--accent))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: 0
                    }}>
                        Realty Photo Enhancement
                    </h1>

                    <nav style={{ display: 'flex', gap: '1.5rem' }}>
                        <a
                            href="/"
                            style={{
                                color: 'var(--foreground)',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.color = 'var(--primary)'}
                            onMouseLeave={(e) => e.target.style.color = 'var(--foreground)'}
                        >
                            Enhance
                        </a>
                        <div
                            onClick={onOpenPresets}
                            style={{
                                color: 'var(--secondary)',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                fontWeight: '500',
                                transition: 'color 0.2s',
                                cursor: 'pointer'
                            }}
                            onMouseOver={(e) => e.target.style.color = 'var(--primary)'}
                            onMouseOut={(e) => e.target.style.color = 'var(--secondary)'}
                        >
                            My Presets
                        </div>
                        <a
                            href="/community"
                            style={{
                                color: 'var(--secondary)',
                                textDecoration: 'none',
                                fontSize: '0.9rem',
                                transition: 'color 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.color = 'var(--primary)'}
                            onMouseLeave={(e) => e.target.style.color = 'var(--secondary)'}
                        >
                            Community
                        </a>
                    </nav>
                </div>

                <div style={{ position: 'relative' }} ref={menuRef}>
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem 1rem',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.borderColor = 'var(--primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                    >
                        <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: 'white'
                        }}>
                            {getInitials()}
                        </div>
                        <span style={{ color: 'var(--foreground)', fontSize: '0.9rem' }}>
                            {user.user_metadata?.full_name || user.email}
                        </span>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            style={{
                                transform: showMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s'
                            }}
                        >
                            <path
                                d="M4 6L8 10L12 6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>

                    {showMenu && (
                        <div style={{
                            position: 'absolute',
                            top: 'calc(100% + 0.5rem)',
                            right: 0,
                            minWidth: '200px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '0.75rem 1rem',
                                borderBottom: '1px solid var(--border)'
                            }}>
                                <p style={{ fontSize: '0.875rem', color: 'var(--secondary)', margin: 0 }}>
                                    {user.email}
                                </p>
                            </div>

                            <button
                                onClick={() => {
                                    setShowMenu(false);
                                    router.push('/profile');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    textAlign: 'left',
                                    color: 'var(--foreground)',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.05)'}
                                onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            >
                                Profile Settings
                            </button>

                            <button
                                onClick={handleClearStorage}
                                disabled={isClearing}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    background: 'transparent',
                                    border: 'none',
                                    textAlign: 'left',
                                    color: 'var(--foreground)',
                                    cursor: isClearing ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    opacity: isClearing ? 0.5 : 1,
                                    transition: 'background 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                                onMouseEnter={(e) => !isClearing && (e.target.style.background = 'rgba(255, 255, 255, 0.05)')}
                                onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                </svg>
                                {isClearing ? 'Clearing...' : 'Clear Storage'}
                            </button>

                            <div style={{ borderTop: '1px solid var(--border)' }}>
                                <button
                                    onClick={handleSignOut}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem',
                                        background: 'transparent',
                                        border: 'none',
                                        textAlign: 'left',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
