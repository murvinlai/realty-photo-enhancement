'use client';

import { useState, useEffect } from 'react';

// Reusable Slider Component (matching EditorModal)
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

export default function LensEditorModal({ isOpen, onClose, selectedImages, onSave, savedLensSettings = {} }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [settings, setSettings] = useState({});
    const [isProcessing, setIsProcessing] = useState(false);

    const activeImage = selectedImages[activeIndex];

    const defaultSettings = {
        lensCorrection: 0,
        verticalStraighten: 0, // 0 to 1 toggle or degree?
        perspectiveX: 0,
        perspectiveY: 0,
        scale: 0, // renamed from zoom
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        fillEdges: false
    };

    useEffect(() => {
        if (isOpen && selectedImages.length > 0) {
            const initialSettings = {};
            selectedImages.forEach(img => {
                initialSettings[img.id] = {
                    ...defaultSettings,
                    ...(savedLensSettings[img.id] || {})
                };
            });
            setSettings(initialSettings);
            setActiveIndex(0);
        }
    }, [isOpen, selectedImages, savedLensSettings]);

    if (!isOpen || !activeImage) return null;

    const currentSettings = settings[activeImage.id] || defaultSettings;

    const updateSetting = (key, value) => {
        setSettings(prev => ({
            ...prev,
            [activeImage.id]: {
                ...prev[activeImage.id],
                [key]: value
            }
        }));
    };

    const handleAutoStraighten = async () => {
        setIsProcessing(true);
        try {
            const response = await fetch('/api/perspective', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePath: activeImage.path })
            });
            const data = await response.json();
            if (data.success) {
                // Update the image path in local state to show the result
                const newPath = `${data.straightenedPath}?t=${Date.now()}`;

                // We actually want to update the image in the parent state too, or just keep it local?
                // For now, let's update the local session settings to track this change.
                // We'll add a 'processedPath' to the settings for this image.
                setSettings(prev => ({
                    ...prev,
                    [activeImage.id]: {
                        ...prev[activeImage.id],
                        processedPath: newPath
                    }
                }));
            } else {
                alert('Auto-Straighten failed: ' + data.error);
            }
        } catch (error) {
            console.error('Perspective API Error:', error);
            alert('Failed to connect to perspective service.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFillEdges = async () => {
        const imageToFill = currentSettings.processedPath || activeImage.path;
        setIsProcessing(true);
        try {
            const response = await fetch('/api/fill-edges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePath: imageToFill })
            });
            const data = await response.json();
            if (data.success) {
                const newPath = `${data.filledPath}?t=${Date.now()}`;
                setSettings(prev => ({
                    ...prev,
                    [activeImage.id]: {
                        ...prev[activeImage.id],
                        processedPath: newPath
                    }
                }));
            } else {
                alert('Generative Fill failed: ' + data.error);
            }
        } catch (error) {
            console.error('Fill API Error:', error);
            alert('Failed to connect to generative fill service.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSave = async () => {
        // We can either save the settings and let parent process on download,
        // or process now. The user said "Apply All Changes".
        // Let's assume we pass the settings back and parent handles the final state.
        onSave(settings);
        onClose();
    };

    // Preview Transform Proxy
    // CSS doesn't have a simple lens distortion, but we can proxy perspective
    const getTransformStyle = (s) => {
        const perspective = 1000;
        const rotateX = s.perspectiveY * 0.2;
        const rotateY = s.perspectiveX * 0.2;
        const rotateZ = s.rotation || 0;
        // Lens correction proxy: very subtle scale/distortion (hard to do in flat CSS)
        const lensScale = 1 + (Math.abs(s.lensCorrection) / 500);
        const zoomScale = 1 + ((s.scale || 0) / 100);
        const totalScale = lensScale * zoomScale;

        // Offsets
        const transX = s.offsetX || 0;
        const transY = s.offsetY || 0;

        return {
            transform: `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${totalScale}) translate(${transX}%, ${transY}%)`,
            transition: 'transform 0.1s linear'
        };
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
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
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>Lens Editor</h2>
                    <span style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>
                        {activeIndex + 1} of {selectedImages.length} selected
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={onClose} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '0.5rem 1.25rem', borderRadius: 'var(--radius)', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} style={{ background: 'var(--primary)', border: 'none', color: 'white', padding: '0.5rem 1.5rem', borderRadius: 'var(--radius)', fontWeight: '600', cursor: 'pointer' }}>Save all</button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Canvas */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
                        <div style={{
                            position: 'relative',
                            overflow: 'hidden',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
                            // Checkerboard background for transparency
                            backgroundImage: `
                                linear-gradient(45deg, #333 25%, transparent 25%),
                                linear-gradient(-45deg, #333 25%, transparent 25%),
                                linear-gradient(45deg, transparent 75%, #333 75%),
                                linear-gradient(-45deg, transparent 75%, #333 75%)
                            `,
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                            backgroundColor: '#444'
                        }}>
                            <img
                                src={currentSettings.processedPath || activeImage.path}
                                alt="Preview"
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    display: 'block',
                                    ...getTransformStyle(currentSettings),
                                    opacity: isProcessing ? 0.5 : 1
                                }}
                            />
                            {isProcessing && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'rgba(0,0,0,0.7)',
                                    color: 'white',
                                    padding: '1rem 2rem',
                                    borderRadius: '2rem',
                                    zIndex: 10
                                }}>
                                    Processing...
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filmstrip */}
                    <div style={{ height: '110px', background: 'rgba(0,0,0,0.8)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '0.75rem', overflowX: 'auto', padding: '0 2rem' }}>
                        {selectedImages.map((img, idx) => (
                            <div key={img.id} onClick={() => setActiveIndex(idx)} style={{
                                height: '70px',
                                minWidth: '100px',
                                borderRadius: '6px',
                                border: idx === activeIndex ? '2px solid var(--primary)' : '2px solid transparent',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                background: '#000', // Container is black
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}>
                                <img
                                    src={img.path}
                                    style={{
                                        height: '100%',
                                        width: 'auto', // Fit to height, let width be natural
                                        maxWidth: '100%', // Prevent overflow
                                        objectFit: 'contain',
                                        // Checkerboard ONLY on the image element
                                        backgroundImage: `
                                            linear-gradient(45deg, #333 25%, transparent 25%),
                                            linear-gradient(-45deg, #333 25%, transparent 25%),
                                            linear-gradient(45deg, transparent 75%, #333 75%),
                                            linear-gradient(-45deg, transparent 75%, #333 75%)
                                        `,
                                        backgroundSize: '10px 10px',
                                        backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                                        backgroundColor: '#444'
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sidebar */}
                <div style={{ width: '320px', background: '#161616', borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', color: 'white', padding: '2rem' }}>
                    <h3 style={{ margin: '0 0 2rem 0', fontSize: '1rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--secondary)' }}>Geometry Tools</h3>

                    <div style={{ marginBottom: '2.5rem' }}>
                        <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '1.25rem', fontWeight: '600' }}>Perspective</p>
                        <button
                            onClick={handleAutoStraighten}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>📐</span> Auto-Straighten Verticals
                        </button>

                        <SliderWithInput label="Vertical Tilt" value={currentSettings.perspectiveY} onChange={(v) => updateSetting('perspectiveY', v)} />
                        <SliderWithInput label="Horizontal Tilt" value={currentSettings.perspectiveX} onChange={(v) => updateSetting('perspectiveX', v)} />
                        <SliderWithInput label="Rotation" value={currentSettings.rotation || 0} min={-45} max={45} onChange={(v) => updateSetting('rotation', v)} />
                    </div>

                    <div style={{ marginBottom: '2.5rem' }}>
                        <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '1.25rem', fontWeight: '600' }}>Lens & Zoom</p>
                        <SliderWithInput label="Distortion" value={currentSettings.lensCorrection} onChange={(v) => updateSetting('lensCorrection', v)} />
                        <SliderWithInput label="Scale" value={currentSettings.scale || 0} min={0} max={100} onChange={(v) => updateSetting('scale', v)} />

                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <SliderWithInput label="X Offset" value={currentSettings.offsetX || 0} min={-50} max={50} onChange={(v) => updateSetting('offsetX', v)} />
                            <SliderWithInput label="Y Offset" value={currentSettings.offsetY || 0} min={-50} max={50} onChange={(v) => updateSetting('offsetY', v)} />
                        </div>
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                        <button
                            onClick={handleFillEdges}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                                border: 'none',
                                borderRadius: '8px',
                                color: 'white',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)'
                            }}
                        >
                            <span>✨</span> AI Outpainting
                        </button>
                        <p style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '0.75rem', textAlign: 'center' }}>
                            Intelligently fills empty spaces at edges.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
