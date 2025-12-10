'use client';

import { useEffect, useState } from 'react';


export default function AdminUsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        // We need to call a server-side API or use the service role via an API route to list all users,
        // because the client-side library can't list all users directly (security).
        // However, for this MVP plan, we can query the 'profiles' table if it exists and mirrors users.
        // Or better, we create a server action / API route.
        // Let's create an API route: /api/admin/users

        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data.users || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;

        try {
            const res = await fetch(`/api/admin/users?id=${userId}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete user');
            }

            // Remove from local state
            setUsers(users.filter(u => u.id !== userId));
        } catch (err) {
            alert(err.message);
        }
    };

    return (
        <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
                User Management
            </h1>

            {error && (
                <div style={{
                    padding: '1rem',
                    marginBottom: '1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '0.5rem',
                    color: '#ef4444'
                }}>
                    Error: {error}
                </div>
            )}

            <div className="glass" style={{ borderRadius: '1rem', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--secondary)' }}>Email</th>
                                <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--secondary)' }}>Role</th>
                                <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--secondary)' }}>Created At</th>
                                <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--secondary)' }}>Last Sign In</th>
                                <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--secondary)' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary)' }}>
                                        Loading users...
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--secondary)' }}>
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div>{user.email}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{
                                                padding: '0.25rem 0.75rem',
                                                borderRadius: '1rem',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                background: user.role === 'admin' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                color: user.role === 'admin' ? '#60a5fa' : 'var(--secondary)',
                                                border: user.role === 'admin' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border)'
                                            }}>
                                                {user.role === 'admin' ? 'ADMIN' : 'USER'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                                            {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Never'}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                disabled={user.role === 'admin'}
                                                title={user.role === 'admin' ? "Cannot delete admin user" : "Delete user"}
                                                style={{
                                                    padding: '0.5rem 0.75rem',
                                                    background: user.role === 'admin' ? 'rgba(255,255,255,0.05)' : 'rgba(239, 68, 68, 0.1)',
                                                    color: user.role === 'admin' ? 'var(--secondary)' : '#ef4444',
                                                    border: 'none',
                                                    borderRadius: '0.25rem',
                                                    fontSize: '0.8rem',
                                                    cursor: user.role === 'admin' ? 'not-allowed' : 'pointer',
                                                    opacity: user.role === 'admin' ? 0.5 : 1
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
