
'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import RenameModal from './RenameModal';

export default function Gallery({ originals, results, onUpdateResult, onActiveTabChange, selectedImages, onToggleSelection, onDeleteSelected, onDeselectAll, onRename }) {
    const [activeTab, setActiveTab] = useState('original');
    const [lightboxImage, setLightboxImage] = useState(null);
    const [lightboxInstructions, setLightboxInstructions] = useState('');
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [userClosedLightbox, setUserClosedLightbox] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);

    // Auto-switch to newest result tab when a new result is created
    useEffect(() => {
        if (results.length > 0) {
            const newestResult = results[results.length - 1];
            setActiveTab(`result - ${newestResult.id} `);
        } else if (results.length === 0 && activeTab !== 'original') {
            setActiveTab('original');
        }
    }, [results.length]);

    // Notify parent of active tab changes
    useEffect(() => {
        if (onActiveTabChange) {
            // Compute label directly from activeTab
            let label = 'Original';
            if (activeTab.startsWith('result-')) {
                const resultId = parseInt(activeTab.replace('result-', ''));
                label = `Result ${resultId} `;
            }
            onActiveTabChange(label);
        }
    }, [activeTab, onActiveTabChange]);

    if (!originals || originals.length === 0) return null;

    const tabs = [
        { id: 'original', label: 'Original' },
        ...results.map(result => ({ id: `result - ${result.id} `, label: `Result ${result.id} ` }))
    ];

    const handleDownload = (imagePath, filename) => {
        // Use file-saver for robust saving
        // If imagePath is relative, make it absolute for fetch
        let url = imagePath;
        if (url && url.startsWith('/')) {
            url = `${window.location.origin}${url} `;
        }

        saveAs(url, filename);
    };

    const handleDownloadAll = async (images, prefix = '') => {
        setIsDownloading(true);

        // Prepare file list with ABSOLUTE URLs
        const filesToDownload = images.map(img => {
            let url = img.enhancedPath || img.path;
            if (url && url.startsWith('/')) {
                url = `${window.location.origin}${url} `;
            }
            return {
                url: url,
                filename: prefix ? `${prefix} -${img.displayName || img.originalName} ` : (img.displayName || img.originalName)
            };
        });

        // ELECTRON: Native Bulk Save (Still prefer native if available)
        if (window.electron) {
            try {
                const result = await window.electron.saveFiles(filesToDownload);
                if (result.canceled) {
                    console.log('Download cancelled');
                } else {
                    alert(`Successfully saved ${result.successCount} photos!`);
                }
            } catch (error) {
                console.error('Electron download error:', error);
                alert('Failed to save photos.');
            } finally {
                setIsDownloading(false);
            }
            return;
        }

        // WEB: Zip Download using JSZip
        console.log('Starting bulk download (Web Mode - Zip)...');
        try {
            const zip = new JSZip();
            const folder = zip.folder("photos");

            // Fetch all images
            // Use Promise.all to fetch in parallel
            const promises = filesToDownload.map(async (file) => {
                try {
                    const response = await fetch(file.url);
                    if (!response.ok) throw new Error(`Failed to fetch ${file.url} `);
                    const blob = await response.blob();
                    folder.file(file.filename, blob);
                } catch (err) {
                    console.error('Failed to download file for zip:', file.filename, err);
                }
            });

            await Promise.all(promises);

            // Generate zip
            const content = await zip.generateAsync({ type: "blob" });

            const zipName = prefix ? `${prefix} -photos.zip` : `photos - ${Date.now()}.zip`;
            saveAs(content, zipName);

        } catch (error) {
            console.error('Zip creation failed:', error);
            alert('Failed to package photos for download.');
        } finally {
            setIsDownloading(false);
        }
    };

    const openLightbox = (imagePath, imageName, context) => {
        setLightboxImage({ path: imagePath, name: imageName, context });
        setLightboxInstructions('');
        setUserClosedLightbox(false);
    };

    const closeLightbox = () => {
        setUserClosedLightbox(true);
        setLightboxImage(null);
        setLightboxInstructions('');
        setIsEnhancing(false);
    };

    const handleLightboxEnhance = async () => {
        if (!lightboxImage || !lightboxImage.context) return;

        const { resultId, imageIndex, originalPath } = lightboxImage.context;
        const instructions = lightboxInstructions || "Increase exposure, make colors more vibrant, and sharpen details.";

        setIsEnhancing(true);

        // Update thumbnail status to processing
        onUpdateResult(resultId, imageIndex, {
            status: 'processing'
        });

        try {
            const response = await fetch('/api/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imagePath: originalPath,
                    instructions
                })
            });

            const data = await response.json();

            if (data.success) {
                // Update the specific image in the result
                onUpdateResult(resultId, imageIndex, {
                    status: 'done',
                    enhancedPath: data.enhancedPath
                });

                // Close lightbox after successful enhancement (only if user hasn't closed it manually)
                if (!userClosedLightbox) {
                    closeLightbox();
                }
            } else {
                onUpdateResult(resultId, imageIndex, {
                    status: 'error',
                    error: data.error || 'Failed'
                });
                alert(`Enhancement failed: ${data.error || 'Unknown error'} `);
            }
        } catch (error) {
            onUpdateResult(resultId, imageIndex, {
                status: 'error',
                error: 'Network error'
            });
            alert(`Network error: ${error.message} `);
        } finally {
            setIsEnhancing(false);
        }
    };

    return (
        <div style={{ marginTop: '3rem' }}>
            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1.5rem',
                borderBottom: '2px solid rgba(255,255,255,0.1)',
                overflowX: 'auto'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: activeTab === tab.id ? 'var(--primary)' : 'transparent',
                            color: activeTab === tab.id ? 'white' : 'var(--secondary)',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            fontWeight: activeTab === tab.id ? '600' : '400',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Original Tab */}
            {activeTab === 'original' && (
                <>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {selectedImages && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                    onClick={onDeselectAll}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: 'var(--secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '600'
                                    }}
                                >
                                    Unselect All
                                </button>
                                <button
                                    onClick={onDeleteSelected}
                                    disabled={selectedImages.size === 0}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: selectedImages.size > 0 ? 'var(--error)' : 'rgba(255,255,255,0.1)',
                                        color: selectedImages.size > 0 ? 'white' : 'var(--secondary)',
                                        border: 'none',
                                        borderRadius: 'var(--radius)',
                                        cursor: selectedImages.size > 0 ? 'pointer' : 'not-allowed',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem'
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                    </svg>
                                    Delete Selected ({selectedImages.size})
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => handleDownloadAll(originals.map(o => ({ ...o, enhancedPath: null })))}
                            disabled={isDownloading}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: isDownloading ? 'var(--secondary)' : 'var(--accent)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 'var(--radius)',
                                cursor: isDownloading ? 'wait' : 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: '600'
                            }}
                        >
                            {isDownloading ? 'Downloading...' : `📥 Download All(${originals.length})`}
                        </button>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '1.5rem'
                    }}>
                        {originals.map((img, index) => (
                            <div key={index} className="glass" style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                                <div
                                    style={{ position: 'relative', aspectRatio: '4/3', background: '#000', cursor: 'pointer' }}
                                    onClick={() => openLightbox(img.path, img.displayName || img.originalName, null)}
                                >
                                    {console.log('Rendering Image:', img.originalName, img.path)}
                                    <img
                                        src={img.path}
                                        alt={img.originalName}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onError={(e) => console.error('Original Image Load Failed:', img.path, e)}
                                    />
                                    {/* Selection Checkbox */}
                                    {onToggleSelection && selectedImages && (
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleSelection(img.path);
                                            }}
                                            style={{
                                                position: 'absolute',
                                                top: '0.5rem',
                                                left: '0.5rem',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: selectedImages.has(img.path) ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                                                border: '2px solid white',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                zIndex: 10
                                            }}
                                        >
                                            {selectedImages.has(img.path) && (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div style={{ padding: '1rem' }}>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '0.9rem',
                                        color: 'var(--foreground)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {img.displayName || img.originalName}
                                    </p>
                                    <button
                                        onClick={() => handleDownload(img.path, img.displayName || img.originalName)}
                                        style={{
                                            marginTop: '0.5rem',
                                            padding: '0.5rem 1rem',
                                            background: 'var(--accent)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 'var(--radius)',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            width: '100%'
                                        }}
                                    >
                                        Download
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Result Tabs */}
            {results.map(result => (
                activeTab === `result - ${result.id} ` && (
                    <div key={result.id}>
                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                                onClick={() => setShowRenameModal(true)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'var(--secondary)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 'var(--radius)',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600'
                                }}
                            >
                                Rename
                            </button>
                            <button
                                onClick={() => handleDownloadAll(result.images, `result - ${result.id} `)}
                                disabled={isDownloading}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: isDownloading ? 'var(--secondary)' : 'var(--accent)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 'var(--radius)',
                                    cursor: isDownloading ? 'wait' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600'
                                }}
                            >
                                {isDownloading ? 'Downloading...' : `📥 Download All(${result.images.filter(img => img.status === 'done').length} / ${result.images.length})`}
                            </button>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: '1.5rem'
                        }}>
                            {result.images.map((img, index) => (
                                <div key={index} className="glass" style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                                    <div
                                        style={{ position: 'relative', aspectRatio: '4/3', background: '#000', cursor: 'pointer' }}
                                        onClick={() => img.enhancedPath && openLightbox(
                                            img.enhancedPath,
                                            img.originalName,
                                            { resultId: result.id, imageIndex: index, originalPath: img.originalPath }
                                        )}
                                    >
                                        <img
                                            src={img.enhancedPath || img.originalPath}
                                            alt={img.originalName}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => console.error('Result Image Load Failed:', img.enhancedPath || img.originalPath, e)}
                                        />

                                        <div style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            right: '0.5rem',
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '1rem',
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                            background: img.status === 'done' ? 'var(--success)' :
                                                img.status === 'processing' ? 'var(--primary)' :
                                                    img.status === 'stopped' ? 'var(--secondary)' :
                                                        img.status === 'error' ? 'var(--error)' : 'rgba(0,0,0,0.6)',
                                            color: 'white'
                                        }}>
                                            {img.status === 'done' ? 'Enhanced' :
                                                img.status === 'processing' ? 'Processing...' :
                                                    img.status === 'stopped' ? 'Stopped' :
                                                        img.status === 'error' ? 'Error' : 'Pending'}
                                        </div>
                                    </div>

                                    <div style={{ padding: '1rem' }}>
                                        <p style={{
                                            margin: 0,
                                            fontSize: '0.9rem',
                                            color: 'var(--foreground)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {img.displayName || img.originalName}
                                        </p>
                                        {img.error && (
                                            <p style={{ color: 'var(--error)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                                {img.error}
                                            </p>
                                        )}
                                        {img.status === 'done' && img.enhancedPath && (
                                            <button
                                                onClick={() => handleDownload(img.enhancedPath, img.displayName || `enhanced - ${img.originalName} `)}
                                                style={{
                                                    marginTop: '0.5rem',
                                                    padding: '0.5rem 1rem',
                                                    background: 'var(--accent)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius)',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem',
                                                    width: '100%'
                                                }}
                                            >
                                                Download
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ))}

            {/* Lightbox with Enhancement */}
            {lightboxImage && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeLightbox();
                    }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.95)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '2rem',
                        gap: '2rem'
                    }}
                >
                    {/* Image */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '60%' }}>
                        <div style={{ position: 'relative' }}>
                            <img
                                src={lightboxImage.path}
                                alt={lightboxImage.name}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '80vh',
                                    objectFit: 'contain',
                                    borderRadius: 'var(--radius)'
                                }}
                            />
                            <div style={{
                                position: 'absolute',
                                bottom: '-2rem',
                                left: 0,
                                color: 'white',
                                fontSize: '0.9rem'
                            }}>
                                {lightboxImage.name}
                            </div>
                        </div>
                    </div>

                    {/* Enhancement Panel (only for result tabs) */}
                    {lightboxImage.context && (
                        <div className="glass" style={{
                            width: '400px',
                            padding: '2rem',
                            borderRadius: 'var(--radius)',
                            maxHeight: '80vh',
                            overflowY: 'auto'
                        }}>
                            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Enhance This Photo</h3>

                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                                Custom Instructions
                            </label>
                            <textarea
                                value={lightboxInstructions}
                                onChange={(e) => setLightboxInstructions(e.target.value)}
                                placeholder="e.g., Increase exposure, make colors more vibrant..."
                                disabled={isEnhancing}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--input-bg)',
                                    color: 'var(--foreground)',
                                    minHeight: '120px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    marginBottom: '1rem'
                                }}
                            />

                            <button
                                onClick={handleLightboxEnhance}
                                disabled={isEnhancing}
                                style={{
                                    width: '100%',
                                    padding: '1rem',
                                    borderRadius: 'var(--radius)',
                                    border: 'none',
                                    background: isEnhancing ? 'var(--secondary)' : 'linear-gradient(to right, var(--primary), var(--accent))',
                                    color: 'white',
                                    fontWeight: '600',
                                    fontSize: '1rem',
                                    cursor: isEnhancing ? 'not-allowed' : 'pointer',
                                    opacity: isEnhancing ? 0.7 : 1
                                }}
                            >
                                {isEnhancing ? 'Enhancing...' : 'Enhance Photo'}
                            </button>
                        </div>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={closeLightbox}
                        style={{
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: 'white',
                            fontSize: '2rem',
                            width: '3rem',
                            height: '3rem',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        ✕
                    </button>
                </div>
            )}
            {showRenameModal && activeTab.startsWith('result-') && (
                <RenameModal
                    isOpen={showRenameModal}
                    onClose={() => setShowRenameModal(false)}
                    previewImages={results.find(r => r.id === parseInt(activeTab.split('-')[1]))?.images || []}
                    onRename={(data) => {
                        const resultId = parseInt(activeTab.split('-')[1]);
                        if (onRename && resultId) {
                            onRename(resultId, data);
                        }
                    }}
                />
            )}
        </div>
    );
}
