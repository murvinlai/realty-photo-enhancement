'use client';

import { useEffect, useState } from 'react';
import { supabaseAdminClient } from '@/lib/supabase';

export default function AdminPresetsPage() {
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    const [editId, setEditId] = useState(null);

    // Form State
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [instructions, setInstructions] = useState('');

    useEffect(() => {
        fetchPresets();
    }, []);

    const fetchPresets = async () => {
        setLoading(true);
        // Fetch only global presets for management here
        const { data, error } = await supabaseAdminClient
            .from('enhancement_presets')
            .select('*')
            .eq('is_global', true)
            .order('created_at', { ascending: false });

        if (data) setPresets(data);
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();

        // Construct settings object matching the user-facing app structure
        const settingsPayload = { instructions: instructions };

        const { data: { user } } = await supabaseAdminClient.auth.getUser();

        let error;

        if (editId) {
            // Update
            const { error: updateError } = await supabaseAdminClient
                .from('enhancement_presets')
                .update({
                    name,
                    description,
                    settings: settingsPayload
                })
                .eq('id', editId);
            error = updateError;
        } else {
            // Create
            const { error: insertError } = await supabaseAdminClient
                .from('enhancement_presets')
                .insert([
                    {
                        name,
                        description,
                        settings: settingsPayload,
                        is_global: true,
                        user_id: user.id
                    }
                ]);
            error = insertError;
        }

        if (error) {
            alert('Error saving preset: ' + error.message);
        } else {
            resetForm();
            fetchPresets();
        }
    };

    const resetForm = () => {
        setShowForm(false);
        setEditId(null);
        setName('');
        setDescription('');
        setInstructions('');
    };

    const startEdit = (preset) => {
        setEditId(preset.id);
        setName(preset.name);
        setDescription(preset.description || '');
        // Extract instructions from settings JSON safely
        setInstructions(preset.settings?.instructions || '');
        setShowForm(true);
        // Scroll to top to see form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this global preset? Users relying on it might be affected.')) return;

        const { error } = await supabaseAdminClient
            .from('enhancement_presets')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Error deleting: ' + error.message);
        } else {
            fetchPresets();
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    Default Presets
                </h1>
                <button
                    onClick={() => {
                        if (showForm) resetForm();
                        else setShowForm(true);
                    }}
                    style={{
                        padding: '0.75rem 1.5rem',
                        background: showForm ? '#374151' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    {showForm ? 'Cancel' : 'Add Preset'}
                </button>
            </div>

            {showForm && (
                <div style={{
                    marginBottom: '2rem',
                    background: '#1f2937', // Darker background like screenshot
                    border: '1px solid #3b82f6', // Blue border
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'white' }}>
                            {editId ? 'Edit Preset' : 'New Preset'}
                        </h2>
                    </div>

                    <form onSubmit={handleSave}>
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    placeholder="Preset Name"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '0.5rem',
                                        border: 'none',
                                        background: '#111827', // Dark input
                                        color: 'white',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    placeholder="Short Description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        borderRadius: '0.5rem',
                                        border: 'none',
                                        background: '#111827',
                                        color: 'white',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <textarea
                                placeholder="Give it more sunlight."
                                value={instructions}
                                onChange={e => setInstructions(e.target.value)}
                                rows={6}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    borderRadius: '0.5rem',
                                    border: 'none',
                                    background: '#111827',
                                    color: 'white',
                                    fontSize: '0.95rem',
                                    fontFamily: 'monospace',
                                    lineHeight: '1.5',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', alignItems: 'center' }}>
                            <button
                                type="button"
                                onClick={resetForm}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#d1d5db',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    padding: '0.5rem 1rem'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                style={{
                                    padding: '0.6rem 1.5rem',
                                    background: '#10b981', // Green button
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem'
                                }}
                            >
                                Save Changes
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gap: '1rem' }}>
                {loading ? (
                    <p>Loading...</p>
                ) : presets.length === 0 ? (
                    <p>No global presets defined.</p>
                ) : (
                    presets.map(preset => (
                        <div key={preset.id} className="glass" style={{ padding: '1.5rem', borderRadius: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'white' }}>{preset.name}</h3>
                                <p style={{ color: 'var(--secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{preset.description}</p>
                                <div style={{ marginTop: '0.75rem' }}>
                                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--secondary)', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                                        Instructions:
                                    </span>
                                    <div style={{
                                        fontSize: '0.9rem',
                                        color: '#e5e7eb',
                                        background: 'rgba(0,0,0,0.3)',
                                        padding: '0.75rem',
                                        borderRadius: '0.5rem',
                                        marginTop: '0.25rem',
                                        maxWidth: '100%',
                                        whiteSpace: 'pre-wrap',
                                        fontFamily: 'inherit',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        {preset.settings?.instructions || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No instructions provided.</span>}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => startEdit(preset)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        color: '#60a5fa',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(preset.id)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: '#ef4444',
                                        border: 'none',
                                        borderRadius: '0.5rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
