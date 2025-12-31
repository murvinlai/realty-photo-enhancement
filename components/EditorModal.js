'use client';

import { useState, useEffect, useRef } from 'react';

// Reusable Slider Component
const SliderWithInput = ({ label, value, onChange, min = -100, max = 100 }) => {
    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--secondary)' }}>{label}</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums', width: '3ch', textAlign: 'right' }}>{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value))}
                style={{
                    width: '100%',
                    accentColor: 'var(--primary)',
                    cursor: 'pointer'
                }}
            />
        </div>
    );
};

export default function EditorModal({ isOpen, onClose, selectedImages, onSave, savedEdits = {} }) {
    // selectedImages: array of full image objects { id, path, originalName, ... }
    // savedEdits: { [imageId]: { brightness: 0, ... } }

    const [activeIndex, setActiveIndex] = useState(0);
    const [edits, setEdits] = useState({}); // Local session validation { [imageId]: { ... } }
    const [clipboard, setClipboard] = useState(null);

    const activeImage = selectedImages[activeIndex];

    const defaultAdjustments = {
        temperature: 0,
        tint: 0,
        brightness: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        vibrance: 0,
        saturation: 0,
        sharpness: 0,
        clarity: 0
    };

    // Initialize edits from savedEdits when modal opens
    useEffect(() => {
        if (isOpen && selectedImages.length > 0) {
            const initialEdits = {};
            selectedImages.forEach(img => {
                // Load saved edit or default
                initialEdits[img.id] = {
                    ...defaultAdjustments,
                    ...(savedEdits[img.id] || {})
                };
            });
            setEdits(initialEdits);
            setActiveIndex(0);
        }
    }, [isOpen, selectedImages, savedEdits]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                setActiveIndex(prev => Math.max(0, prev - 1));
            } else if (e.key === 'ArrowRight') {
                setActiveIndex(prev => Math.min(selectedImages.length - 1, prev + 1));
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImages.length, onClose]);

    if (!isOpen || !activeImage) return null;

    const currentAdjustments = edits[activeImage.id] || defaultAdjustments;

    const updateAdjustment = (key, value) => {
        setEdits(prev => ({
            ...prev,
            [activeImage.id]: {
                ...prev[activeImage.id],
                [key]: value
            }
        }));
    };

    const handleReset = () => {
        setEdits(prev => ({
            ...prev,
            [activeImage.id]: { ...defaultAdjustments }
        }));
    };

    const handleSyncAll = () => {
        if (!window.confirm('Apply these settings to ALL selected images?')) return;
        const newEdits = { ...edits };
        selectedImages.forEach(img => {
            newEdits[img.id] = { ...currentAdjustments };
        });
        setEdits(newEdits);
    };

    const handleCopy = () => {
        setClipboard({ ...currentAdjustments });
    };

    const handlePaste = () => {
        if (!clipboard) return;
        setEdits(prev => ({
            ...prev,
            [activeImage.id]: { ...clipboard }
        }));
    };

    const handleBatchSave = () => {
        onSave(edits);
        onClose();
    };

    // Calculate CSS Filter String for Preview
    // Note: CSS filters are limited. We map what we can and use proxies for others.
    const getFilterString = (adj) => {
        if (!adj) return 'none';

        // Basic Light
        const bright = adj.brightness || 0;
        const b = 100 + bright;
        // Contrast S-Curve proxy: boost standard contrast slightly to mimic punch
        const c = 100 + (adj.contrast || 0) * 1.1;

        // Color: Saturation is direct, Vibrance includes a pop (contrast/brightness)
        const vib = adj.vibrance || 0;
        const sat = adj.saturation || 0;

        // Saturation compensation for brightness is handled in `sFinal`
        const brightComp = bright > 0 ? (bright / 10) : 0;
        const sFinal = 100 + (vib * 0.8) + (sat * 1.0) + brightComp;

        const vibPopC = vib * 0.1;
        const vibPopB = vib * 0.05;

        // Temperature Logic (Normalized)
        let tempFilter = '';
        const temp = adj.temperature || 0;
        if (temp > 0) {
            // Warm: sepia + warm hue. Normalized means less brightness boost.
            tempFilter = `sepia(${temp * 0.5}%) hue-rotate(-10deg) saturate(${100 + temp * 0.1}%)`;
        } else if (temp < 0) {
            // Cool: Blue tint.
            tempFilter = `hue-rotate(180deg) sepia(${-temp * 0.5}%) hue-rotate(-180deg) saturate(${100 - temp * 0.1}%)`;
        }

        // Tint
        const h = (adj.tint || 0) * 1.5;

        // Texture Proxies: CSS has no native sharpen. Use contrast boost and blur filters.
        const sharpness = adj.sharpness || 0;
        const clarity = adj.clarity || 0;

        // Positive Sharpness Proxy: Contrast pop
        const sharpnessPopC = sharpness > 0 ? (sharpness * 0.15) : 0;
        const texturePopC = sharpnessPopC + (clarity * 0.3);
        const texturePopB = (clarity * 0.1);

        // Negative Sharpness Proxy: Real CSS Blur
        const blurFilter = sharpness < 0 ? `blur(${Math.abs(sharpness) / 20}px)` : '';

        // Highlights/Shadows/Whites/Blacks Proxy:
        const shadows = adj.shadows || 0;
        const highlights = adj.highlights || 0;
        const whites = adj.whites || 0;
        const blacks = adj.blacks || 0;

        // Weighted Brightness Proxy: 
        // We reduce the raw brightness factor slightly to mimic the roll-off, 
        // and compensate with a tiny contrast boost to lift midtones.
        const bWeight = bright > 0 ? 0.85 : 1.0;

        // Levels Logic Proxies
        let blacksB = 0, blacksC = 0;
        if (blacks > 0) {
            blacksB = blacks * 0.1; // Lift
            blacksC = -blacks * 0.05; // Fade
        } else {
            blacksB = blacks * 0.1; // Darken
            blacksC = -blacks * 0.05; // Crush
        }

        let whitesB = whites * 0.1;
        let whitesC = whites * 0.05;

        const bFinal = (100 + (bright * bWeight)) + (shadows * 0.1) - (highlights * 0.1) + whitesB + blacksB + vibPopB + texturePopB;
        const cFinal = c + (highlights * 0.1) - (shadows * 0.05) + whitesC + blacksC + vibPopC + texturePopC + (bright > 0 ? bright * 0.05 : 0);

        return `brightness(${bFinal}%) contrast(${cFinal}%) saturate(${sFinal}%) hue-rotate(${h}deg) ${tempFilter} ${blurFilter}`;
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            zIndex: 2000,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'var(--font-main)'
        }}>
            {/* Header */}
            <div style={{
                padding: '1rem 2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#111',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>Manual Editor</h2>
                    <span style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>
                        {activeIndex + 1} of {selectedImages.length} selected
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            padding: '0.5rem 1.25rem',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleBatchSave}
                        style={{
                            background: 'var(--primary)',
                            border: 'none',
                            color: 'white',
                            padding: '0.5rem 1.5rem',
                            borderRadius: 'var(--radius)',
                            fontWeight: '600',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)'
                        }}
                    >
                        Save all
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Center Canvas */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#0a0a0a',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '2rem',
                        position: 'relative'
                    }}>
                        <img
                            src={activeImage.path}
                            alt="Preview"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
                                filter: getFilterString(currentAdjustments),
                                transition: 'filter 0.1s linear'
                            }}
                        />

                        {/* Navigation Arrows */}
                        {selectedImages.length > 1 && (
                            <>
                                <button
                                    onClick={() => setActiveIndex(prev => Math.max(0, prev - 1))}
                                    disabled={activeIndex === 0}
                                    style={{
                                        position: 'absolute',
                                        left: '1rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        color: 'white',
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        opacity: activeIndex === 0 ? 0.3 : 1
                                    }}
                                >
                                    ←
                                </button>
                                <button
                                    onClick={() => setActiveIndex(prev => Math.min(selectedImages.length - 1, prev + 1))}
                                    disabled={activeIndex === selectedImages.length - 1}
                                    style={{
                                        position: 'absolute',
                                        right: '1rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        color: 'white',
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        opacity: activeIndex === selectedImages.length - 1 ? 0.3 : 1
                                    }}
                                >
                                    →
                                </button>
                            </>
                        )}
                    </div>

                    {/* Filmstrip */}
                    <div style={{
                        height: '110px',
                        background: 'rgba(0,0,0,0.8)',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        overflowX: 'auto',
                        padding: '0 2rem',
                        scrollbarWidth: 'none'
                    }}>
                        {selectedImages.map((img, idx) => (
                            <div
                                key={img.id}
                                onClick={() => setActiveIndex(idx)}
                                style={{
                                    height: '70px',
                                    minWidth: '100px',
                                    borderRadius: '6px',
                                    border: idx === activeIndex ? '2px solid var(--primary)' : '2px solid transparent',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    transition: 'transform 0.2s',
                                    transform: idx === activeIndex ? 'scale(1.05)' : 'scale(1)',
                                    position: 'relative'
                                }}
                            >
                                <img
                                    src={img.path}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        filter: getFilterString(edits[img.id])
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Sidebar - Tools */}
                <div style={{
                    width: '320px',
                    background: '#161616',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    color: 'white'
                }}>
                    <div style={{ padding: '2rem', flex: 1, overflowY: 'auto', paddingBottom: '4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--secondary)' }}>Adjustments</h3>
                            <button
                                onClick={handleReset}
                                style={{
                                    fontSize: '0.8rem',
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--primary)',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    fontWeight: '500'
                                }}
                            >
                                Reset Current
                            </button>
                        </div>

                        {/* Batch Operations Toolbar */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '0.5rem',
                            marginBottom: '2.5rem',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '8px'
                        }}>
                            <button
                                onClick={handleCopy}
                                title="Copy Current Settings"
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    padding: '0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Copy
                            </button>
                            <button
                                onClick={handlePaste}
                                title="Paste Settings"
                                disabled={!clipboard}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    padding: '0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: clipboard ? 'pointer' : 'not-allowed',
                                    opacity: clipboard ? 1 : 0.4
                                }}
                            >
                                Paste
                            </button>
                            <button
                                onClick={handleSyncAll}
                                title="Apply Settings to All"
                                style={{
                                    background: 'transparent',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    padding: '0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Sync All
                            </button>
                        </div>

                        {/* Group: White Balance */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--secondary)', marginBottom: '1.25rem', fontWeight: '600' }}>
                                White Balance
                            </p>
                            <SliderWithInput
                                label="Temperature"
                                value={currentAdjustments.temperature}
                                onChange={(v) => updateAdjustment('temperature', v)}
                            />
                            <SliderWithInput
                                label="Tint"
                                value={currentAdjustments.tint}
                                onChange={(v) => updateAdjustment('tint', v)}
                            />
                        </div>

                        {/* Group: Light */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--secondary)', marginBottom: '1.25rem', fontWeight: '600' }}>
                                Light
                            </p>
                            <SliderWithInput
                                label="Brightness"
                                value={currentAdjustments.brightness}
                                onChange={(v) => updateAdjustment('brightness', v)}
                            />
                            <SliderWithInput
                                label="Contrast"
                                value={currentAdjustments.contrast}
                                onChange={(v) => updateAdjustment('contrast', v)}
                            />
                            <SliderWithInput
                                label="Highlights"
                                value={currentAdjustments.highlights}
                                onChange={(v) => updateAdjustment('highlights', v)}
                            />
                            <SliderWithInput
                                label="Shadows"
                                value={currentAdjustments.shadows}
                                onChange={(v) => updateAdjustment('shadows', v)}
                            />
                            <SliderWithInput
                                label="Whites"
                                value={currentAdjustments.whites}
                                onChange={(v) => updateAdjustment('whites', v)}
                            />
                            <SliderWithInput
                                label="Blacks"
                                value={currentAdjustments.blacks}
                                onChange={(v) => updateAdjustment('blacks', v)}
                            />
                        </div>

                        {/* Group: Color */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--secondary)', marginBottom: '1.25rem', fontWeight: '600' }}>
                                Color
                            </p>
                            <SliderWithInput
                                label="Vibrance"
                                value={currentAdjustments.vibrance}
                                onChange={(v) => updateAdjustment('vibrance', v)}
                            />
                            <SliderWithInput
                                label="Saturation"
                                value={currentAdjustments.saturation}
                                onChange={(v) => updateAdjustment('saturation', v)}
                            />
                        </div>

                        {/* Group: Texture */}
                        <div style={{ marginBottom: '2.5rem' }}>
                            <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--secondary)', marginBottom: '1.25rem', fontWeight: '600' }}>
                                Texture
                            </p>
                            <SliderWithInput
                                label="Sharpness"
                                value={currentAdjustments.sharpness}
                                onChange={(v) => updateAdjustment('sharpness', v)}
                            />
                            <SliderWithInput
                                label="Clarity"
                                value={currentAdjustments.clarity}
                                onChange={(v) => updateAdjustment('clarity', v)}
                            />
                        </div>

                        <div style={{ padding: '1.25rem', background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--secondary)', lineHeight: '1.4', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>ℹ</span>
                                Adjustments are applied to the full-size images upon saving.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
