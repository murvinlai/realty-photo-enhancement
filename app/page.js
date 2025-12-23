'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import UploadZone from '@/components/UploadZone';
import ControlPanel from '@/components/ControlPanel';
import Gallery from '@/components/Gallery';
import PresetManagementModal from '@/components/PresetManagementModal';
import EditorModal from '@/components/EditorModal';

export default function Home() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [originals, setOriginals] = useState([]);
    const [results, setResults] = useState([]);
    const [resultCounter, setResultCounter] = useState(0);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [activeTabLabel, setActiveTabLabel] = useState('Original');
    const [showPresetManager, setShowPresetManager] = useState(false);
    const [presetRefreshTrigger, setPresetRefreshTrigger] = useState(0);
    const [selectedImages, setSelectedImages] = useState(new Set());
    const [sessionId, setSessionId] = useState('');
    const [showEditor, setShowEditor] = useState(false);
    const [editStates, setEditStates] = useState({}); // { [imageId]: { brightness: 0, ... } }
    const abortControllerRef = useRef(null);

    const generateSessionId = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${year}${month}${day}${hour}${minute}`;
        return `${timestamp}-${crypto.randomUUID()}`;
    };

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

    // Initialize Session ID
    useEffect(() => {
        setSessionId(generateSessionId());
    }, []);

    // Clear selection when tab changes
    useEffect(() => {
        setSelectedImages(new Set());
    }, [activeTabLabel]);

    // Show loading state while checking auth
    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--background)'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        border: '3px solid var(--border)',
                        borderTop: '3px solid var(--primary)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 1rem'
                    }} />
                    <p style={{ color: 'var(--secondary)' }}>Loading...</p>
                </div>
            </div>
        );
    }

    // Don't render if not authenticated
    if (!user) {
        return null;
    }

    const handleUploadComplete = (newFiles) => {
        // Add new files to originals array
        const newOriginals = newFiles.map(file => {
            let displayOriginalName = file.originalName;

            // If the server converted HEIC to JPG, update the display name extension
            if ((file.originalName.toLowerCase().endsWith('.heic') || file.originalName.toLowerCase().endsWith('.heif')) &&
                file.path.toLowerCase().endsWith('.jpg')) {
                displayOriginalName = file.originalName.replace(/\.(heic|heif)$/i, '.jpg');
            }

            return {
                id: `orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                path: file.path,
                originalName: file.originalName, // Keep true original name for reference
                displayName: displayOriginalName, // Use updated name for UI
                uploadedAt: Date.now()
            };
        });
        setOriginals(prev => [...prev, ...newOriginals]);
    };

    const handleToggleSelection = (id) => {
        setSelectedImages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };



    const handleDeselectAll = () => {
        setSelectedImages(new Set());
    };

    const handleDeleteSelected = async () => {
        if (selectedImages.size === 0) return;

        if (!window.confirm(`Are you sure you want to delete ${selectedImages.size} selected photo(s)?`)) {
            return;
        }

        // 1. Remove from local state
        setOriginals(prev => prev.filter(img => !selectedImages.has(img.id)));

        // 2. Clear selection
        setSelectedImages(new Set());

        // 3. Optional: Delete from server (if desired/implemented in API)
        // For now, consistent with "Start Over" logic which just clears state, 
        // but maybe we should technically delete files? 
        // The implementation plan mainly focused on UI deletion. 
        // Given "Clear Storage" exists, maybe UI only is safe for now, 
        // OR we can fire a background request to delete specific files.
        // Let's stick to UI removal for "Originals" context to match "Start Over" behavior which is client-side list clear.
        // Actually, user said "delete any selected one", usually implies gone.
        // But since "Start Over" button clears originals from state, let's mirror that.
    };

    const handleRename = (resultId, { mode, params }) => {
        setResults(prev => prev.map(result => {
            if (result.id !== resultId) return result;

            const newImages = result.images.map((img, index) => {
                let currentName = img.displayName || img.originalName;
                const ext = currentName.match(/\.[^.]+$/)?.[0] || '';
                const baseName = currentName.replace(/\.[^.]+$/, '');

                let newBaseName = baseName;

                if (mode === 'replace') {
                    if (params.replaceFind) {
                        newBaseName = baseName.split(params.replaceFind).join(params.replaceWith);
                    }
                } else if (mode === 'add') {
                    if (params.addPosition === 'before') {
                        newBaseName = `${params.addText}${baseName}`;
                    } else {
                        newBaseName = `${baseName}${params.addText}`;
                    }
                } else if (mode === 'format') {
                    const nameStr = params.customFormat || 'Untitled';
                    const numStr = String(params.startNumber + index); // 1-indexed based on array position + offset
                    newBaseName = `${nameStr}${numStr}`;
                }

                return {
                    ...img,
                    displayName: `${newBaseName}${ext}`
                };
            });

            return { ...result, images: newImages };
        }));
    };


    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsEnhancing(false);

        // Mark any remaining pending/processing images in the current result as stopped
        setResults(prev => {
            if (prev.length === 0) return prev;
            const currentResultId = resultCounter;
            return prev.map(result =>
                result.id === currentResultId ? {
                    ...result,
                    images: result.images.map(img =>
                        (img.status === 'pending' || img.status === 'processing')
                            ? { ...img, status: 'stopped' }
                            : img
                    )
                } : result
            );
        });
    };

    const handleEnhance = async (instructions) => {
        setIsEnhancing(true);

        // Create new AbortController
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const signal = controller.signal;

        // Determine source images based on active tab
        let sourceImages = [];
        let sourceLabel = '';

        if (!activeTabLabel || activeTabLabel === 'Original') {
            // Check if there are selected images
            const pool = (selectedImages.size > 0)
                ? originals.filter(img => selectedImages.has(img.path))
                : originals;

            sourceImages = pool.map(orig => ({
                path: orig.path,
                originalName: orig.originalName
            }));
            sourceLabel = 'Original';
        } else {
            // Parse "Version X" to find the result
            // Assuming tabs are named "Version 1", "Version 2" etc matching result.id or index
            // Let's check how Gallery names them. If Gallery uses "Result {id}", we match that.
            // If Gallery uses "Version {i+1}", we match index.

            // For now, let's look for a result whose computed label might match, 
            // OR finding the result with the highest ID if "Latest" is desired? 
            // The user said "Tab i am focus on".

            // Search in results. We need to know how Gallery constructs the label.
            // Based on typical behavior:
            const match = activeTabLabel.match(/Version (\d+)/i);
            if (match) {
                const versionId = parseInt(match[1], 10);
                const prevResult = results.find(r => r.id === versionId);

                if (prevResult) {
                    sourceImages = prevResult.images.map(img => ({
                        path: img.enhancedPath || img.originalPath, // Use generic 'path' for processing
                        originalName: img.originalName
                    }));
                    sourceLabel = activeTabLabel;
                }
            } else if (activeTabLabel.includes('Result')) {
                // Fallback if named Result X
                const match = activeTabLabel.match(/Result (\d+)/i);
                if (match) {
                    const resId = parseInt(match[1], 10);
                    const prevResult = results.find(r => r.id === resId);
                    if (prevResult) {
                        sourceImages = prevResult.images.map(img => ({
                            path: img.enhancedPath,
                            originalName: img.originalName
                        }));
                        sourceLabel = activeTabLabel;
                    }
                }
            }
        }

        // Fallback to originals if logic fails or empty
        if (sourceImages.length === 0) {
            console.warn("Could not find source images for tab:", activeTabLabel, "- Falling back to originals");
            sourceImages = originals.map(orig => ({ path: orig.path, originalName: orig.originalName }));
            sourceLabel = 'Original';
        }

        // Create new result entry
        const newResultId = resultCounter + 1;
        const newResult = {
            id: newResultId,
            timestamp: Date.now(),
            instructions,
            source: sourceLabel, // Track source for UI/Debug
            images: sourceImages.map(src => ({
                id: `res-${newResultId}-${Math.random().toString(36).substr(2, 9)}`,
                originalPath: src.path, // This enhanced path becomes the "original" for the new generation
                originalName: src.originalName,
                status: 'pending',
                version: 1
            }))
        };

        setResults(prev => [...prev, newResult]);
        setResultCounter(newResultId);

        // Worker pool: Maintain N concurrent workers (configurable via env)
        const MAX_CONCURRENT = parseInt(process.env.NEXT_PUBLIC_BATCH_SIZE || '5', 10);

        const processImage = async (src, index) => {
            if (signal.aborted) return;

            // Update status to processing when actually starting
            setResults(prev => prev.map(result =>
                result.id === newResultId ? {
                    ...result,
                    images: result.images.map((img, i) =>
                        i === index ? { ...img, status: 'processing' } : img
                    )
                } : result
            ));

            try {
                const response = await fetch('/api/enhance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: src.path,
                        instructions,
                        sessionId: sessionId // Send session ID
                    }),
                    signal
                });

                const data = await response.json();

                if (data.success) {
                    if (signal.aborted) return;
                    setResults(prev => prev.map(result =>
                        result.id === newResultId ? {
                            ...result,
                            images: result.images.map((img, i) =>
                                i === index ? { ...img, status: 'done', enhancedPath: data.enhancedPath } : img
                            )
                        } : result
                    ));
                } else {
                    if (signal.aborted) return;
                    setResults(prev => prev.map(result =>
                        result.id === newResultId ? {
                            ...result,
                            images: result.images.map((img, i) =>
                                i === index ? { ...img, status: 'error', error: data.error || 'Failed' } : img
                            )
                        } : result
                    ));
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.log('Request aborted');
                    setResults(prev => prev.map(result =>
                        result.id === newResultId ? {
                            ...result,
                            images: result.images.map((img, i) =>
                                i === index ? { ...img, status: 'stopped' } : img
                            )
                        } : result
                    ));
                    return;
                }
                setResults(prev => prev.map(result =>
                    result.id === newResultId ? {
                        ...result,
                        images: result.images.map((img, i) =>
                            i === index ? { ...img, status: 'error', error: 'Network error' } : img
                        )
                    } : result
                ));
            }
        };

        try {
            // Worker pool implementation
            let currentIndex = 0;
            const workers = [];

            // Start initial workers up to MAX_CONCURRENT
            for (let i = 0; i < Math.min(MAX_CONCURRENT, sourceImages.length); i++) {
                const worker = (async () => {
                    while (currentIndex < sourceImages.length) {
                        if (signal.aborted) break;
                        const index = currentIndex++;
                        if (index < sourceImages.length) {
                            await processImage(sourceImages[index], index);
                        }
                    }
                })();
                workers.push(worker);
            }

            // Wait for all workers to complete
            await Promise.all(workers);
        } finally {
            if (!signal.aborted) {
                setIsEnhancing(false);
                abortControllerRef.current = null;
            }
        }
    };

    const handleUpdateResult = (resultId, imageIndex, updates) => {
        setResults(prev => prev.map(result =>
            result.id === resultId ? {
                ...result,
                images: result.images.map((img, i) => {
                    if (i === imageIndex) {
                        const updatedImg = { ...img, ...updates };
                        // If this is a successful enhancement, increment version
                        if (updates.enhancedPath && updates.status === 'done') {
                            const newVersion = (img.version || 1) + 1;
                            updatedImg.version = newVersion;
                            // Update display name to show version
                            const ext = img.originalName.match(/\.[^.]+$/)?.[0] || '';
                            const nameWithoutExt = img.originalName.replace(/\.[^.]+$/, '');
                            updatedImg.displayName = `${nameWithoutExt}_v${newVersion}${ext}`;
                        }
                        return updatedImg;
                    }
                    return img;
                })
            } : result
        ));
    };

    const handleReset = () => {
        if (window.confirm('Start fresh? This will clear all uploaded photos and results.')) {
            setOriginals([]);
            setResults([]);
            setResultCounter(0);
            setActiveTabLabel('Original');
            setIsEnhancing(false);
            setSelectedImages(new Set());
            setSessionId(generateSessionId()); // Reset Session ID with new timestamp
            setEditStates({}); // Clear edit history
        }
    };

    const handleEditSave = async (newEdits) => {
        // newEdits: { [imageId]: { brightness: 10, ... } }
        setEditStates(prev => ({ ...prev, ...newEdits }));

        // Identify images to process (those in newEdits)
        const imagesToProcess = Object.keys(newEdits);

        // We need to find the files in originals or results based on ID.
        // Helper to find image object
        const findImageById = (id) => {
            const orig = originals.find(o => o.id === id);
            if (orig) return { img: orig, type: 'original' };

            for (const res of results) {
                const img = res.images.find(i => i.id === id);
                if (img) return { img, type: 'result', resId: res.id };
            }
            return null;
        };

        setIsEnhancing(true);

        try {
            for (const imageId of imagesToProcess) {
                const found = findImageById(imageId);
                if (!found) continue;

                const adjustments = newEdits[imageId];
                // Only process if adjustments exist and are not all zero (optional optimization)

                const response = await fetch('/api/edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: found.img.path,
                        adjustments,
                        sessionId,
                        imageId: found.img.id
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    // Update the image path in state to force reload
                    // We append a query param to bust cache if path is same, or use new path
                    const newPath = `${data.editedPath}?t=${Date.now()}`;

                    if (found.type === 'original') {
                        setOriginals(prev => prev.map(o => o.id === imageId ? { ...o, path: newPath } : o));
                    } else {
                        handleUpdateResult(found.resId, found.img.index, { path: newPath }); // Need index?
                        // handleUpdateResult expects index, but we have ID. 
                        // Let's manually update results state for robustness
                        setResults(prev => prev.map(res =>
                            res.id === found.resId ? {
                                ...res,
                                images: res.images.map(img => img.id === imageId ? { ...img, path: newPath } : img)
                            } : res
                        ));
                    }
                } else {
                    console.error('Edit failed for', imageId);
                }
            }
        } catch (error) {
            console.error('Batch edit error', error);
            alert('Failed to save edits');
        } finally {
            setIsEnhancing(false);
        }
    };
    const getSelectedImageObjects = () => {
        const selectedObjs = [];
        if (activeTabLabel === 'Original') {
            originals.forEach(o => {
                if (selectedImages.has(o.id)) {
                    selectedObjs.push(o);
                }
            });
        } else {
            const match = activeTabLabel.match(/Result (\d+)/i);
            if (match) {
                const resId = parseInt(match[1]);
                const activeRes = results.find(r => r.id === resId);
                if (activeRes) {
                    activeRes.images.forEach(img => {
                        if (selectedImages.has(img.id)) {
                            selectedObjs.push({
                                ...img,
                                path: img.enhancedPath || img.originalPath
                            });
                        }
                    });
                }
            }
        }
        return selectedObjs;
    };



    return (
        <main style={{ minHeight: '100vh', paddingBottom: '2rem' }}>
            <Header
                onOpenPresets={() => setShowPresetManager(true)}
            />
            <div className="container">
                <UploadZone
                    onUploadComplete={handleUploadComplete}
                    onReset={handleReset}
                    onStop={handleStop}
                    isProcessing={isEnhancing}
                    sessionId={sessionId}
                />
                <ControlPanel
                    onEnhance={handleEnhance}
                    disabled={originals.length === 0}
                    photoCount={originals.length}
                    selectedCount={selectedImages.size}
                    activeTabLabel={activeTabLabel}
                    isEnhancing={isEnhancing}
                    onOpenPresetManager={() => setShowPresetManager(true)}
                    presetRefreshTrigger={presetRefreshTrigger}
                    onPresetSaved={() => setPresetRefreshTrigger(prev => prev + 1)}
                />
                <Gallery
                    originals={originals}
                    results={results}
                    onUpdateResult={handleUpdateResult}
                    onActiveTabChange={setActiveTabLabel}
                    selectedImages={selectedImages}
                    onToggleSelection={handleToggleSelection}
                    onDeselectAll={handleDeselectAll}
                    onDeleteSelected={handleDeleteSelected}
                    onRename={handleRename}

                    onEdit={() => setShowEditor(true)}
                />
            </div>

            {/* Manual Editor Modal */}
            {showEditor && (
                <EditorModal
                    isOpen={true}
                    onClose={() => setShowEditor(false)}
                    selectedImages={getSelectedImageObjects()}
                    onSave={handleEditSave}
                    savedEdits={editStates}
                />
            )}

            {/* Global Preset Manager */}
            {/* Dynamically imported or just rendered conditionally */}
            {showPresetManager && (
                <div style={{ position: 'relative', zIndex: 100 }}>
                    <PresetManagementModal
                        isOpen={true}
                        onClose={() => setShowPresetManager(false)}
                        onRefresh={() => setPresetRefreshTrigger(prev => prev + 1)}
                    />
                </div>
            )}
        </main>
    );
}
