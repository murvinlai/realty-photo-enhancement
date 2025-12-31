
'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import RenameModal from './RenameModal';
import DownloadOptions from './DownloadOptions';

export default function Gallery({ primaries, results, onUpdateResult, onActiveTabChange, selectedImages, onToggleSelection, onDeleteSelected, onDeselectAll, onRename, onEdit, onLensEdit }) {
    const [activeTab, setActiveTab] = useState('primary');
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
            setActiveTab(`result-${newestResult.id}`);
        } else if (results.length === 0 && activeTab !== 'primary') {
            setActiveTab('primary');
        }
    }, [results.length]);

    // Notify parent of active tab changes
    useEffect(() => {
        if (onActiveTabChange) {
            // Compute label directly from activeTab
            let label = 'Primary';
            if (activeTab.startsWith('result-')) {
                const resultId = parseInt(activeTab.replace('result-', ''));
                label = `Result ${resultId} `;
            }
            onActiveTabChange(label);
        }
    }, [activeTab, onActiveTabChange]);

    if (!primaries || primaries.length === 0) return null;

    const tabs = [
        { id: 'primary', label: 'Primary' },
        ...results.map(result => ({ id: `result-${result.id}`, label: `Result ${result.id}` }))
    ];

    const handleDownload = (imagePath, filename) => {
        // Use file-saver for robust saving
        // If imagePath is relative, make it absolute for fetch
        let url = imagePath;
        if (url && url.startsWith('/')) {
            url = `${window.location.origin}${url}`;
        }

        saveAs(url, filename);
    };

    const handleDownloadAll = async (images, prefix = '', options = null) => {
        setIsDownloading(true);

        // Prepare file list
        const filesToDownload = images.map(img => {
            let url = img.enhancedPath || img.path;

            // If advanced options present, use API
            if (options) {
                // Determine original path (API needs absolute path or backend resolvable path)
                // In this app, img.path is typically backend relative or absolute.
                // We should pass the raw path to the API.
                // Determine format
                const format = options.format || 'jpg';
                const width = options.width || options.customWidth;

                const params = new URLSearchParams({
                    path: url, // Assuming this is valid for the API
                    format,
                    ...(width && { width })
                });
                url = `/api/download?${params.toString()}`;
            } else if (url && url.startsWith('/')) {
                url = `${window.location.origin}${url}`;
            }

            let filename = prefix ? `${prefix} - ${img.displayName || img.originalName}` : (img.displayName || img.originalName);

            // Fix extension if transforming
            if (options && options.format) {
                const nameParts = filename.split('.');
                if (nameParts.length > 1) nameParts.pop(); // Remove old ext
                filename = `${nameParts.join('.')}.${options.format === 'jpeg' ? 'jpg' : options.format}`;
            }

            return {
                url: url,
                filename: filename
            };
        });

        // ELECTRON: Native Bulk Save (Skip for now if advanced options used, or treat same if API returns stream)
        // Electron saver likely just fetches URLs. If URL is local API, it should work.
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
                    if (!response.ok) throw new Error(`Failed to fetch ${file.url}`);
                    const blob = await response.blob();
                    folder.file(file.filename, blob);
                } catch (err) {
                    console.error('Failed to download file for zip:', file.filename, err);
                }
            });

            await Promise.all(promises);

            // Generate zip
            const content = await zip.generateAsync({ type: "blob" });

            const zipName = prefix ? `${prefix}-photos.zip` : `photos-${Date.now()}.zip`;
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
                marginBottom: '1rem',
                borderBottom: '2px solid rgba(255,255,255,0.1)',
                overflowX: 'auto',
                position: 'sticky',
                top: '74px', // Below Header
                zIndex: 90,
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(10px)',
                padding: '0.5rem 0', // Add padding to cover background
                margin: '0 -2rem 1.5rem', // Negative margin to stretch full width of container, then bottom margin
                paddingLeft: '2rem', // Restore padding
                paddingRight: '2rem'
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

            {/* Primary Tab */}
            {activeTab === 'primary' && (
                <>
                    <div style={{
                        marginBottom: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        position: 'sticky',
                        top: '135px', // Below Header + Tabs
                        zIndex: 80,
                        background: 'rgba(15, 23, 42, 0.9)',
                        backdropFilter: 'blur(10px)',
                        padding: '1rem 0',
                        marginTop: '-1rem' // Compensate for spacing
                    }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                onClick={onDeselectAll}
                                disabled={!selectedImages || selectedImages.size === 0}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'var(--secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius)',
                                    cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                }}
                            >
                                Unselect All
                            </button>
                            <button
                                onClick={() => setShowRenameModal(true)}
                                disabled={!selectedImages || selectedImages.size === 0}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'var(--secondary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius)',
                                    cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Rename ({selectedImages ? selectedImages.size : 0})
                            </button>
                            <button
                                onClick={onDeleteSelected}
                                disabled={!selectedImages || selectedImages.size === 0}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.05)' : 'var(--error)',
                                    color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'white',
                                    border: 'none',
                                    borderRadius: 'var(--radius)',
                                    cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                </svg>
                                Delete ({selectedImages ? selectedImages.size : 0})
                            </button>
                            <button
                                onClick={onEdit}
                                disabled={!selectedImages || selectedImages.size === 0}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.05)' : 'var(--primary)',
                                    color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'white',
                                    border: 'none',
                                    borderRadius: 'var(--radius)',
                                    cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                                Color Edit ({selectedImages ? selectedImages.size : 0})
                            </button>
                            <button
                                onClick={onLensEdit}
                                disabled={!selectedImages || selectedImages.size === 0}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
                                    color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'white',
                                    border: 'none',
                                    borderRadius: 'var(--radius)',
                                    cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="3" y1="9" x2="21" y2="9"></line>
                                    <line x1="3" y1="15" x2="21" y2="15"></line>
                                    <line x1="9" y1="3" x2="9" y2="21"></line>
                                    <line x1="15" y1="3" x2="15" y2="21"></line>
                                </svg>
                                Lens Editor ({selectedImages ? selectedImages.size : 0})
                            </button>
                        </div>
                        <div style={{ minWidth: '200px' }}>
                            <DownloadOptions
                                buttonLabel={isDownloading ? 'Downloading...' : `📥 Download All(${primaries.length})`}
                                onDownloadCustom={() => handleDownloadAll(primaries.map(o => ({ ...o, enhancedPath: null })))}
                                onAdvancedDownload={(opts) => handleDownloadAll(primaries.map(o => ({ ...o, enhancedPath: null })), '', opts)}
                            />
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '1.5rem'
                    }}>
                        {primaries.map((img, index) => (
                            <div key={index} className="glass" style={{ borderRadius: 'var(--radius)' }}>
                                <div
                                    style={{
                                        position: 'relative',
                                        aspectRatio: '4/3',
                                        background: '#000',
                                        cursor: 'pointer',
                                        borderTopLeftRadius: 'var(--radius)',
                                        borderTopRightRadius: 'var(--radius)',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center'
                                    }}
                                    onClick={() => openLightbox(img.path, img.displayName || img.originalName, null)}
                                >
                                    {console.log('Rendering Image:', img.originalName, img.path)}
                                    <img
                                        src={img.enhancedPath || img.lensPath || img.path}
                                        alt={img.originalName}
                                        style={{
                                            width: 'auto',
                                            height: 'auto',
                                            maxWidth: '100%',
                                            maxHeight: '100%',
                                            objectFit: 'contain',
                                            // Checkerboard only on image
                                            backgroundImage: `
                                                linear-gradient(45deg, #333 25%, transparent 25%),
                                                linear-gradient(-45deg, #333 25%, transparent 25%),
                                                linear-gradient(45deg, transparent 75%, #333 75%),
                                                linear-gradient(-45deg, transparent 75%, #333 75%)
                                            `,
                                            backgroundSize: '20px 20px',
                                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                                            backgroundColor: '#444'
                                        }}
                                        onError={(e) => console.error('Original Image Load Failed:', img.path, e)}
                                    />
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleSelection(img.id);
                                        }}
                                        style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            left: '0.5rem',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            background: selectedImages.has(img.id) ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                                            border: '2px solid white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            zIndex: 10
                                        }}
                                    >
                                        {selectedImages.has(img.id) && (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        )}
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
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <DownloadOptions
                                            imagePath={img.lensPath || img.path}
                                            originalName={img.displayName || img.originalName}
                                            onDownloadCustom={handleDownload}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {results.map(result => (
                activeTab === `result-${result.id}` && (
                    <div key={result.id}>
                        <div style={{
                            marginBottom: '1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            position: 'sticky',
                            top: '135px', // Below Header + Tabs
                            zIndex: 80,
                            background: 'rgba(15, 23, 42, 0.9)',
                            backdropFilter: 'blur(10px)',
                            padding: '1rem 0',
                            marginTop: '-1rem'
                        }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                    onClick={onDeselectAll}
                                    disabled={!selectedImages || selectedImages.size === 0}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'var(--secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                    }}
                                >
                                    Unselect All
                                </button>
                                <button
                                    onClick={() => setShowRenameModal(true)}
                                    disabled={!selectedImages || selectedImages.size === 0}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'var(--secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                    Rename ({selectedImages ? selectedImages.size : 0})
                                </button>
                                <button
                                    onClick={onDeleteSelected}
                                    disabled={!selectedImages || selectedImages.size === 0}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.05)' : 'var(--error)',
                                        color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'white',
                                        border: 'none',
                                        borderRadius: 'var(--radius)',
                                        cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                                    </svg>
                                    Delete ({selectedImages ? selectedImages.size : 0})
                                </button>
                                <button
                                    onClick={onEdit}
                                    disabled={!selectedImages || selectedImages.size === 0}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.05)' : 'var(--primary)',
                                        color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'white',
                                        border: 'none',
                                        borderRadius: 'var(--radius)',
                                        cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 20h9"></path>
                                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                    </svg>
                                    Color Edit ({selectedImages ? selectedImages.size : 0})
                                </button>
                                <button
                                    onClick={onLensEdit}
                                    disabled={!selectedImages || selectedImages.size === 0}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
                                        color: (!selectedImages || selectedImages.size === 0) ? 'rgba(255,255,255,0.3)' : 'white',
                                        border: 'none',
                                        borderRadius: 'var(--radius)',
                                        cursor: (!selectedImages || selectedImages.size === 0) ? 'not-allowed' : 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        opacity: (!selectedImages || selectedImages.size === 0) ? 0.5 : 1
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="3" y1="9" x2="21" y2="9"></line>
                                        <line x1="3" y1="15" x2="21" y2="15"></line>
                                        <line x1="9" y1="3" x2="9" y2="21"></line>
                                        <line x1="15" y1="3" x2="15" y2="21"></line>
                                    </svg>
                                    Lens Editor ({selectedImages ? selectedImages.size : 0})
                                </button>
                            </div>
                            <div style={{ minWidth: '200px' }}>
                                <DownloadOptions
                                    buttonLabel={isDownloading ? 'Downloading...' : `📥 Download All(${result.images.filter(img => img.status === 'done').length}/${result.images.length})`}
                                    onDownloadCustom={() => handleDownloadAll(result.images, `Result ${result.id}`)}
                                    onAdvancedDownload={(opts) => handleDownloadAll(result.images, `Result ${result.id}`, opts)}
                                />
                            </div>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                            gap: '1.5rem'
                        }}>
                            {result.images.map((img, index) => (
                                <div key={index} className="glass" style={{ borderRadius: 'var(--radius)' }}>
                                    <div
                                        style={{
                                            position: 'relative',
                                            aspectRatio: '4/3',
                                            background: '#000',
                                            cursor: 'pointer',
                                            borderTopLeftRadius: 'var(--radius)',
                                            borderTopRightRadius: 'var(--radius)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center'
                                        }}
                                        onClick={() => openLightbox(
                                            img.enhancedPath || img.lensPath || img.originalPath || img.path,
                                            img.originalName,
                                            { resultId: result.id, imageIndex: index, originalPath: img.originalPath || img.path }
                                        )}
                                    >
                                        <img
                                            src={img.enhancedPath || img.lensPath || img.originalPath || img.path}
                                            alt={img.originalName}
                                            style={{
                                                width: 'auto',
                                                height: 'auto',
                                                maxWidth: '100%',
                                                maxHeight: '100%',
                                                objectFit: 'contain',
                                                // Checkerboard only on image
                                                backgroundImage: `
                                                    linear-gradient(45deg, #333 25%, transparent 25%),
                                                    linear-gradient(-45deg, #333 25%, transparent 25%),
                                                    linear-gradient(45deg, transparent 75%, #333 75%),
                                                    linear-gradient(-45deg, transparent 75%, #333 75%)
                                                `,
                                                backgroundSize: '20px 20px',
                                                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                                                backgroundColor: '#444'
                                            }}
                                            onError={(e) => console.error('Result Image Load Failed:', img.enhancedPath || img.originalPath, e)}
                                        />

                                        {onToggleSelection && selectedImages && (
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onToggleSelection(img.id);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '0.5rem',
                                                    left: '0.5rem',
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    background: selectedImages.has(img.id) ? 'var(--primary)' : 'rgba(0,0,0,0.5)',
                                                    border: '2px solid white',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    zIndex: 10
                                                }}
                                            >
                                                {selectedImages.has(img.id) && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                    </svg>
                                                )}
                                            </div>
                                        )}

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
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <DownloadOptions
                                                    imagePath={img.enhancedPath}
                                                    originalName={img.displayName || `enhanced - ${img.originalName}`}
                                                    onDownloadCustom={handleDownload}
                                                />
                                            </div>
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
                        <div style={{
                            position: 'relative',
                            // Checkerboard background for transparency in Lightbox
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
                                src={lightboxImage.path}
                                alt={lightboxImage.name}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '80vh',
                                    objectFit: 'contain',
                                    // borderRadius: 'var(--radius)' // Can interfere with exact transparency visualization
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
                            <div style={{
                                position: 'absolute',
                                bottom: '-4.5rem',
                                right: 0,
                                width: '200px'
                            }}>
                                <DownloadOptions
                                    imagePath={lightboxImage.path}
                                    originalName={lightboxImage.name}
                                    onDownloadCustom={handleDownload}
                                />
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
            {showRenameModal && (
                <RenameModal
                    isOpen={showRenameModal}
                    onClose={() => setShowRenameModal(false)}
                    previewImages={activeTab === 'original'
                        ? (selectedImages.size > 0 ? originals.filter(img => selectedImages.has(img.id)) : originals)
                        : (results.find(r => r.id === parseInt(activeTab.split('-')[1]))?.images.filter(img => selectedImages.has(img.id)) || [])
                    }
                    onRename={(data) => {
                        const isOriginal = activeTab === 'original';
                        const resultId = isOriginal ? 'original' : parseInt(activeTab.split('-')[1]);
                        if (onRename) {
                            onRename(resultId, data);
                        }
                    }}
                />
            )}
        </div>
    );
}
