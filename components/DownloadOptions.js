
'use client';

import { useState, useRef, useEffect } from 'react';

export default function DownloadOptions({ imagePath, originalName, onDownloadCustom, onAdvancedDownload, buttonLabel = 'Download' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [format, setFormat] = useState('jpg');
    const [sizeMode, setSizeMode] = useState('original'); // original, 1920, 1024, custom
    const [customWidth, setCustomWidth] = useState(1500);
    const menuRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleMainClick = () => {
        // Default behavior: Download original
        onDownloadCustom(imagePath, originalName); // Or specifically trigger original path download
    };

    const handleAdvancedDownload = () => {
        // Construct query for backend
        let width = null;
        if (sizeMode === '1920') width = 1920;
        if (sizeMode === '1024') width = 1024;
        if (sizeMode === 'custom') width = customWidth;

        if (onAdvancedDownload) {
            onAdvancedDownload({ format, width, sizeMode });
            setIsOpen(false);
            return;
        }

        // Trigger download via API
        // We can use window.location.href or create a link
        // Using a link to open in new tab or trigger download
        const params = new URLSearchParams({
            path: imagePath,
            format,
            ...(width && { width })
        });

        const url = `/api/download?${params.toString()}`;

        // Trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = ''; // Browser should respect header
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setIsOpen(false);
    };

    return (
        <div style={{ position: 'relative', width: '100%' }} ref={menuRef}>
            <div style={{ display: 'flex', width: '100%' }}>
                <button
                    onClick={handleMainClick}
                    style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--accent)',
                        color: 'white',
                        border: 'none',
                        borderTopLeftRadius: 'var(--radius)',
                        borderBottomLeftRadius: 'var(--radius)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}
                >
                    {buttonLabel}
                </button>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        padding: '0.5rem 0.5rem',
                        background: 'var(--accent)',
                        filter: 'brightness(0.9)',
                        color: 'white',
                        border: 'none',
                        borderLeft: '1px solid rgba(255,255,255,0.2)',
                        borderTopRightRadius: 'var(--radius)',
                        borderBottomRightRadius: 'var(--radius)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </div>

            {isOpen && (
                <div className="glass" style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.5rem',
                    width: '280px',
                    padding: '1rem',
                    borderRadius: 'var(--radius)',
                    zIndex: 100,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    background: '#1a1a1a',
                    border: '1px solid var(--border)'
                }}>
                    <h4 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--secondary)' }}>Format</h4>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                        {['jpg', 'png', 'webp'].map(fmt => (
                            <label key={fmt} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--foreground)' }}>
                                <input
                                    type="radio"
                                    name="format"
                                    checked={format === fmt}
                                    onChange={() => setFormat(fmt)}
                                />
                                {fmt.toUpperCase()}
                            </label>
                        ))}
                    </div>

                    <h4 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--secondary)' }}>Size</h4>
                    <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--foreground)' }}>
                            <input type="radio" name="size" checked={sizeMode === 'original'} onChange={() => setSizeMode('original')} />
                            Original
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--foreground)' }}>
                            <input type="radio" name="size" checked={sizeMode === '1920'} onChange={() => setSizeMode('1920')} />
                            Large (1920px width)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--foreground)' }}>
                            <input type="radio" name="size" checked={sizeMode === '1024'} onChange={() => setSizeMode('1024')} />
                            Web (1024px width)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--foreground)' }}>
                            <input type="radio" name="size" checked={sizeMode === 'custom'} onChange={() => setSizeMode('custom')} />
                            Custom Width
                        </label>

                        {sizeMode === 'custom' && (
                            <div style={{ marginLeft: '1.5rem' }}>
                                <input
                                    type="number"
                                    value={customWidth}
                                    onChange={(e) => setCustomWidth(parseInt(e.target.value) || 0)}
                                    style={{
                                        width: '100px',
                                        padding: '0.3rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--input-bg)',
                                        color: 'var(--foreground)',
                                        fontSize: '0.85rem'
                                    }}
                                /> px
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleAdvancedDownload}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius)',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.9rem'
                        }}
                    >
                        Download Copy
                    </button>
                </div>
            )}
        </div>
    );
}
