'use client';

import { useState, useEffect } from 'react';

export default function RenameModal({ isOpen, onClose, onRename, previewImages = [] }) {
    const [mode, setMode] = useState('replace'); // 'replace', 'add', 'format'
    const [replaceFind, setReplaceFind] = useState('');
    const [replaceWith, setReplaceWith] = useState('');

    const [addText, setAddText] = useState('');
    const [addPosition, setAddPosition] = useState('after'); // 'before', 'after'

    const [formatType, setFormatType] = useState('name_index'); // 'name_index', 'name_counter'
    const [customFormat, setCustomFormat] = useState('');
    const [startNumber, setStartNumber] = useState(1);
    const [formatWhere, setFormatWhere] = useState('after'); // 'after', 'before' (though standard macOS rename usually replaces the whole name or appends?)
    // Actually macOS "Format" completely replaces the name usually with "Name + Index".
    // "Custom Format" is the base name. 

    const [examplePreview, setExamplePreview] = useState('');

    useEffect(() => {
        updatePreview();
    }, [mode, replaceFind, replaceWith, addText, addPosition, formatType, customFormat, startNumber, formatWhere, previewImages]);

    if (!isOpen) return null;

    const updatePreview = () => {
        if (!previewImages || previewImages.length === 0) return;

        // Use the first image for preview
        const firstImg = previewImages[0];
        const originalName = firstImg.displayName || firstImg.originalName;
        // Strip extension for manipulation
        const ext = originalName.match(/\.[^.]+$/)?.[0] || '';
        const baseName = originalName.replace(/\.[^.]+$/, '');

        let newBaseName = baseName;

        if (mode === 'replace') {
            if (replaceFind) {
                // Global replace
                newBaseName = baseName.split(replaceFind).join(replaceWith);
            }
        } else if (mode === 'add') {
            if (addPosition === 'before') {
                newBaseName = `${addText}${baseName}`;
            } else {
                newBaseName = `${baseName}${addText}`;
            }
        } else if (mode === 'format') {
            // MacOS Format: "Custom Format" string + Index
            const nameStr = customFormat || 'Untitled';
            const numStr = String(startNumber); // Usually padded? MacOS doesn't pad "Index", but pads "Counter" (00001)

            // Simplified for now: just Name + Number
            newBaseName = `${nameStr}${numStr}`;
        }

        setExamplePreview(`${newBaseName}${ext}`);
    };

    const handleApply = () => {
        onRename({
            mode,
            params: {
                replaceFind,
                replaceWith,
                addText,
                addPosition,
                customFormat,
                startNumber,
                formatType
            }
        });
        onClose();
    };

    const tabStyle = (tabMode) => ({
        padding: '0.5rem 1rem',
        border: 'none',
        background: mode === tabMode ? 'var(--primary)' : 'transparent',
        color: mode === tabMode ? 'white' : 'var(--secondary)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: mode === tabMode ? '600' : '400',
        transition: 'all 0.2s'
    });

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }}>
            <div className="glass" style={{
                width: '500px',
                padding: '2rem',
                borderRadius: 'var(--radius)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '1.5rem', textAlign: 'center' }}>Rename Photo(s)</h3>

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '1.5rem',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '0.25rem',
                    borderRadius: 'var(--radius)'
                }}>
                    <button onClick={() => setMode('replace')} style={tabStyle('replace')}>Replace Text</button>
                    <button onClick={() => setMode('add')} style={tabStyle('add')}>Add Text</button>
                    <button onClick={() => setMode('format')} style={tabStyle('format')}>Format</button>
                </div>

                {/* Content */}
                <div style={{ marginBottom: '2rem' }}>
                    {mode === 'replace' && (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Find:</label>
                                <input
                                    type="text"
                                    value={replaceFind}
                                    onChange={(e) => setReplaceFind(e.target.value)}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--input-bg)' }}
                                    placeholder="Text to find"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Replace with:</label>
                                <input
                                    type="text"
                                    value={replaceWith}
                                    onChange={(e) => setReplaceWith(e.target.value)}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--input-bg)' }}
                                    placeholder="Replacement text"
                                />
                            </div>
                        </div>
                    )}

                    {mode === 'add' && (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <select
                                    value={addPosition}
                                    onChange={(e) => setAddPosition(e.target.value)}
                                    style={{ padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--foreground)' }}
                                >
                                    <option value="after">Add after name</option>
                                    <option value="before">Add before name</option>
                                </select>
                                <input
                                    type="text"
                                    value={addText}
                                    onChange={(e) => setAddText(e.target.value)}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--input-bg)' }}
                                    placeholder="Text to add"
                                />
                            </div>
                        </div>
                    )}

                    {mode === 'format' && (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Custom Format:</label>
                                    <input
                                        type="text"
                                        value={customFormat}
                                        onChange={(e) => setCustomFormat(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--input-bg)' }}
                                        placeholder="e.g. LivingRoom"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Start at:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={startNumber}
                                        onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--input-bg)' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Example Preview */}
                <div style={{
                    marginBottom: '2rem',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.9rem',
                    color: 'var(--secondary)'
                }}>
                    Example: {examplePreview || '...'}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'transparent',
                            color: 'var(--secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            fontWeight: '600'
                        }}
                    >
                        Rename
                    </button>
                </div>
            </div>
        </div>
    );
}
