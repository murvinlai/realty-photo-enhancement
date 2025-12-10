'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/contexts/NotificationContext';

export default function PresetWidget({ onSelectPreset, onManageClick, refreshTrigger }) {
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    // const [showManagement, setShowManagement] = useState(false); // Removed

    // Initial limit for compact view
    const COMPACT_LIMIT = 6;

    useEffect(() => {
        fetchWidgetPresets();
    }, [refreshTrigger]); // Re-fetch when triggered by parent

    const fetchWidgetPresets = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data } = await supabase
                .from('enhancement_presets')
                .select('*')
                .or(`is_global.eq.true,user_id.eq.${user?.id}`)
                .order('is_favorite', { ascending: false }) // Favorites always top
                .order('last_used_at', { ascending: false, nullsFirst: false }) // Then recently used
                .order('created_at', { ascending: false }); // Then new

            if (data) setPresets(data);
        } catch (error) {
            console.error('Error fetching widget presets:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = async (preset) => {
        onSelectPreset(preset);

        // Update usage count and last used (fire and forget)
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !preset.is_global) { // Only track usage for user presets for now to avoid permission errors on global
            supabase.rpc('increment_preset_usage', { preset_id: preset.id });
            // Or simpler update if RPC not set:
            supabase.from('enhancement_presets')
                .update({
                    usage_count: (preset.usage_count || 0) + 1,
                    last_used_at: new Date()
                })
                .eq('id', preset.id)
                .then(() => fetchWidgetPresets()); // Refresh sort after usage
        }
    };

    const displayedPresets = expanded ? presets : presets.slice(0, COMPACT_LIMIT);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Quick Presets
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={onManageClick}
                        title="Manage Presets"
                        style={{ background: 'none', border: 'none', color: 'var(--secondary)', cursor: 'pointer', padding: '0.2rem' }}
                    >
                        ⚙️ Manage
                    </button>
                    {/*
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                        {expanded ? 'Show Less' : 'Show All'}
                    </button>
                    */}
                </div>
            </div>
            {loading ? (
                <div style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>Loading presets...</div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: '0.75rem',
                    gridAutoRows: '1fr', // Ensure rows take equal height
                    overflowY: 'auto',
                    paddingRight: '0.25rem',
                    // Removed flex: expanded ? 1 : 'unset' to prevent vertical stretch
                }}>
                    {displayedPresets.map(preset => (
                        <div
                            key={preset.id}
                            onClick={() => handleSelect(preset)}
                            style={{
                                display: 'flex', // Make flex container
                                flexDirection: 'column', // Stack content
                                padding: '0.75rem',
                                borderRadius: '0.5rem',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                                height: '100%', // Fill grid cell
                                minHeight: '100px' // Minimum height
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.borderColor = 'var(--primary)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                        >
                            {preset.is_favorite && <span style={{ position: 'absolute', top: '5px', right: '5px', fontSize: '0.8rem' }}>❤️</span>}
                            <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.25rem', color: preset.is_global ? 'var(--accent)' : 'var(--foreground)', paddingRight: '1rem' }}>
                                {preset.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {preset.description}
                            </div>
                        </div>
                    ))}
                    {presets.length === 0 && (
                        <div style={{ gridColumn: '1/-1', color: 'var(--secondary)', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                            No presets found. <br /> Click "Manage" to create one!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
