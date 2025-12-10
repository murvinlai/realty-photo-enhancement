'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/contexts/NotificationContext';
import PresetWidget from './PresetWidget';

export default function ControlPanel({ onEnhance, isEnhancing, disabled, photoCount, activeTabLabel, onOpenPresetManager, presetRefreshTrigger }) {
    const [instructions, setInstructions] = useState('');
    const defaultInstructions = "Increase exposure, make colors more vibrant, and sharpen details.";

    // Save Preset State
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetDescription, setNewPresetDescription] = useState('');
    const [newPresetInstructions, setNewPresetInstructions] = useState('');



    const handlePresetClick = (preset) => {
        // Assume settings.instructions holds the text, or fallback to description
        const textToUse = preset.settings?.instructions || preset.description || '';
        setInstructions(textToUse);
    };

    const openSaveModal = () => {
        setNewPresetInstructions(instructions || defaultInstructions);

        setShowSaveModal(true);
    };

    const { addNotification } = useNotification();

    const handleSavePreset = async (e) => {
        e.preventDefault();


        // 1. Check User Session
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error("Auth Check Failed:", authError);
            addNotification(`Cannot save: You are not logged in.`, 'major');
            return;
        }



        // 2. Attempt Insert
        const { error } = await supabase
            .from('enhancement_presets')
            .insert({
                name: newPresetName,
                description: newPresetDescription,
                settings: { instructions: newPresetInstructions },
                user_id: user.id,
                is_global: false
            });

        if (error) {
            console.error('Save Preset Error:', error);
            // Persistent global error
            addNotification('Error saving preset: ' + (error.message || JSON.stringify(error)), 'major');

        } else {
            addNotification('Preset saved successfully!', 'success');
            setShowSaveModal(false);
            setNewPresetName('');
            setNewPresetDescription('');
            fetchPresets();
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onEnhance(instructions || defaultInstructions);
    };

    return (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius)', marginTop: '2rem' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Enhancement Controls</h3>
                {photoCount > 0 && (
                    <span style={{
                        fontSize: '0.85rem',
                        color: 'var(--secondary)',
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '1rem'
                    }}>
                        {photoCount} {photoCount === 1 ? 'photo' : 'photos'} ({activeTabLabel || 'Original'})
                    </span>
                )}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '2rem'
            }}>
                {/* Left Column: Instructions & Actions */}
                <div>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <label style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>
                                    Instructions
                                </label>
                                <button
                                    type="button"
                                    onClick={openSaveModal}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--primary)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    Save as Preset
                                </button>
                            </div>
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder={`e.g., "${defaultInstructions}"`}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--input-bg)',
                                    color: 'var(--foreground)',
                                    minHeight: '150px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    lineHeight: '1.6'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={disabled || isEnhancing}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: 'var(--radius)',
                                border: 'none',
                                background: disabled ? 'var(--secondary)' : 'linear-gradient(to right, var(--primary), var(--primary-hover))',
                                color: 'white',
                                fontWeight: '600',
                                fontSize: '1rem',
                                opacity: disabled ? 0.5 : 1,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: disabled ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)'
                            }}
                        >
                            {isEnhancing ? 'Processing...' : 'Enhance Photos'}
                        </button>
                    </form>
                </div>

                {/* Right Column: Presets Gallery */}
                <div style={{ height: '400px' }}>
                    <PresetWidget
                        onSelectPreset={handlePresetClick}
                        onManageClick={onOpenPresetManager}
                        refreshTrigger={presetRefreshTrigger}
                    />
                </div>
            </div>

            {/* Save Preset Modal */}
            {showSaveModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 50
                }}>
                    <div className="glass" style={{ width: '100%', maxWidth: '500px', padding: '2rem', borderRadius: '1rem', background: '#1e293b' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>Save Custom Preset</h3>
                        <form onSubmit={handleSavePreset}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name</label>
                                <input
                                    type="text"
                                    required
                                    value={newPresetName}
                                    onChange={e => setNewPresetName(e.target.value)}
                                    placeholder="My Awesome Preset"
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'white' }}
                                />
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Instructions to Save</label>
                                <textarea
                                    required
                                    value={newPresetInstructions}
                                    onChange={e => setNewPresetInstructions(e.target.value)}
                                    rows={4}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'white', fontFamily: 'inherit' }}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description (Optional)</label>
                                <input
                                    type="text"
                                    value={newPresetDescription}
                                    onChange={e => setNewPresetDescription(e.target.value)}
                                    placeholder="Brief description for quick reference"
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'white' }}
                                />
                            </div>



                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowSaveModal(false)}
                                    style={{ padding: '0.75rem 1.5rem', background: 'transparent', color: 'var(--secondary)', border: 'none', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '0.75rem 1.5rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    Save Preset
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
