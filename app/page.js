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
import LensEditorModal from '@/components/LensEditorModal';

export default function Home() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [primaries, setPrimaries] = useState([]);
    const [results, setResults] = useState([]);
    const [resultCounter, setResultCounter] = useState(0);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [activeTabLabel, setActiveTabLabel] = useState('Primary');
    const [showPresetManager, setShowPresetManager] = useState(false);
    const [presetRefreshTrigger, setPresetRefreshTrigger] = useState(0);
    const [selectedImages, setSelectedImages] = useState(new Set());
    const [sessionId, setSessionId] = useState('');
    const [showEditor, setShowEditor] = useState(false);
    const [showLensEditor, setShowLensEditor] = useState(false);
    const [editStates, setEditStates] = useState({}); // { [imageId]: { brightness: 0, ... } }
    const [lensStates, setLensStates] = useState({}); // { [imageId]: { lensCorrection: 0, ... } }
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
        const newPrimaries = newFiles.map(file => {
            let displayOriginalName = file.originalName;

            // If the server changed extension (e.g. HEIC -> JPG), update the display name
            const origExt = file.originalName.match(/\.[^.]+$/)?.[0]?.toLowerCase();
            const newExt = file.path.match(/\.[^.]+$/)?.[0]?.toLowerCase();

            if (origExt && newExt && origExt !== newExt) {
                // Replace extension while preserving case of the base name
                displayOriginalName = file.originalName.replace(/\.[^.]+$/, newExt);
            }

            return {
                id: `orig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                path: file.path,
                originalName: file.originalName, // Keep true original name for reference
                displayName: displayOriginalName.trim(), // Use updated name for UI
                uploadedAt: Date.now()
            };
        });
        setPrimaries(prev => [...prev, ...newPrimaries]);
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

        // 1. Remove from originals (primaries)
        setPrimaries(prev => prev.filter(img => !selectedImages.has(img.id)));

        // 2. Remove from results
        setResults(prev => prev.map(result => ({
            ...result,
            images: result.images.filter(img => !selectedImages.has(img.id))
        })).filter(result => result.images.length > 0)); // Optional: remove empty results

        // 3. Clear selection
        setSelectedImages(new Set());
    };

    const handleRename = async (resultId, { mode, params }) => {
        setIsEnhancing(true);
        try {
            // Helper to compute new name (Shared logic with preview)
            const computeNewName = (img, index) => {
                let currentName = (img.displayName || img.originalName).trim();
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
                    const numStr = String(params.startNumber + index);
                    newBaseName = `${nameStr}${numStr}`;
                }
                return `${newBaseName.trim()}${ext.trim()}`;
            };

            // 1. Identify images to rename
            let imagesToRename = [];
            if (resultId === 'primary') {
                imagesToRename = primaries;
            } else {
                const res = results.find(r => r.id === resultId);
                if (res) imagesToRename = res.images;
            }

            // Filter if selection is active
            if (selectedImages.size > 0) {
                imagesToRename = imagesToRename.filter(img => selectedImages.has(img.id));
            }

            // 2. Process Renames
            // We use a mapping of ID -> NewData to update state in one go
            const updates = {}; // { [id]: { displayName, path } }

            for (let i = 0; i < imagesToRename.length; i++) {
                const img = imagesToRename[i];
                const newName = computeNewName(img, i);

                // Skip if name hasn't changed (optimization)
                if (newName === (img.displayName || img.originalName)) continue;

                try {
                    const response = await fetch('/api/rename', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imagePath: img.enhancedPath || img.path, // Rename the expected physical file (enhanced if exists)
                            newName: newName
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        updates[img.id] = {
                            displayName: data.finalName,
                            path: `${data.path}?t=${Date.now()}` // Bust cache
                        };
                    } else {
                        console.error(`Rename failed for ${img.id}`);
                    }
                } catch (e) {
                    console.error(`Rename error for ${img.id}`, e);
                }
            }

            // 3. Update State
            const applyUpdates = (images) => {
                return images.map(img => {
                    if (updates[img.id]) {
                        return {
                            ...img,
                            displayName: updates[img.id].displayName,
                            // Only update path if it was the source path that was renamed
                            // CAREFUL: If we renamed the enhanced path, we should update enhancedPath.
                            // But our logic above sent `enhancedPath || path`.
                            // If `img.enhancedPath` existed, we renamed that file. So update `enhancedPath`.
                            // If not, we renamed `path` (original).
                            ...(img.enhancedPath
                                ? { enhancedPath: updates[img.id].path }
                                : { path: updates[img.id].path }
                            )
                        };
                    }
                    return img;
                });
            };

            if (resultId === 'primary') {
                setPrimaries(prev => applyUpdates(prev));
            } else {
                setResults(prev => prev.map(result => {
                    if (result.id !== resultId) return result;
                    return { ...result, images: applyUpdates(result.images) };
                }));
            }

        } catch (error) {
            console.error('Batch rename error', error);
            alert('An error occurred during renaming.');
        } finally {
            setIsEnhancing(false);
        }
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

        if (!activeTabLabel || activeTabLabel === 'Primary') {
            // Check if there are selected images
            const pool = (selectedImages.size > 0)
                ? primaries.filter(img => selectedImages.has(img.id))
                : primaries;

            sourceImages = pool.map(orig => ({
                path: orig.path,
                originalName: orig.originalName
            }));
            sourceLabel = 'Primary';
        } else {
            // Parse "Version X" or "Result X" to find the result
            const match = activeTabLabel.match(/(Version|Result) (\d+)/i);
            if (match) {
                const resId = parseInt(match[2], 10);
                const prevResult = results.find(r => r.id === resId);

                if (prevResult) {
                    // Filter by selection if active
                    const pool = (selectedImages.size > 0)
                        ? prevResult.images.filter(img => selectedImages.has(img.id))
                        : prevResult.images;

                    sourceImages = pool.map(img => ({
                        path: img.enhancedPath || img.originalPath || img.path,
                        originalName: img.originalName
                    }));
                    sourceLabel = activeTabLabel;
                }
            }
        }

        // Fallback to originals if logic fails or empty
        if (sourceImages.length === 0) {
            console.warn("Could not find source images for tab:", activeTabLabel, "- Falling back to primaries");
            sourceImages = primaries.map(orig => ({ path: orig.path, originalName: orig.originalName }));
            sourceLabel = 'Primary';
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
                        sessionId: sessionId, // Send session ID
                        suffix: `-result-${newResultId}`,
                        originalName: src.originalName
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
            setPrimaries([]);
            setResults([]);
            setResultCounter(0);
            setActiveTabLabel('Primary');
            setIsEnhancing(false);
            setSelectedImages(new Set());
            setSessionId(generateSessionId()); // Reset Session ID with new timestamp
            setEditStates({}); // Clear edit history
            setLensStates({}); // Clear lens history
        }
    };

    // Helper to find image object across all tabs
    const findImageById = (id) => {
        // Use String string comparison for safety (handle number vs string ID types)
        const sid = String(id);
        const orig = primaries.find(o => String(o.id) === sid);
        if (orig) return { img: orig, type: 'primary' };

        for (const res of results) {
            const img = res.images.find(i => String(i.id) === sid);
            if (img) return { img, type: 'result', resId: res.id };
        }
        return null;
    };

    const handleLensSave = async (newLensSettings) => {
        // We don't save to state immediately because if we succeed, we overwrite the file (bake it)
        // and thus want to reset the sliders to 0.
        // setLensStates(prev => ({ ...prev, ...newLensSettings })); <--- REMOVED

        const imagesToProcess = Object.keys(newLensSettings);
        console.log('Processing Lens Save for IDs:', imagesToProcess);

        setIsEnhancing(true);

        try {
            for (const imageId of imagesToProcess) {
                // Determine finding with robust string ID
                const found = findImageById(imageId);

                if (!found) {
                    console.warn(`Image ID ${imageId} not found in state (Type: ${typeof imageId})`);
                    continue;
                }

                console.log(`Processing ID ${imageId} found as ${found.type} (State ID: ${found.img.id})`);
                const settings = newLensSettings[imageId];

                const response = await fetch('/api/perspective', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: found.img.path,
                        settings,
                        sessionId,
                        imageId: found.img.id
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const newPath = `${data.straightenedPath || data.processedPath}?t=${Date.now()}`;
                    console.log('Lens Batch Success:', { imageId, newPath });

                    // Clear lens state (reset sliders) because changes are now baked into the file
                    setLensStates(prev => {
                        const next = { ...prev };
                        delete next[imageId];
                        return next;
                    });

                    if (found.type === 'primary') {
                        setPrimaries(prev => prev.map(o => String(o.id) === String(imageId) ? {
                            ...o,
                            path: newPath, // Update main path (In-Place Edit)
                            lensPath: null // Clear separate lens path
                        } : o));
                    } else {
                        setResults(prev => prev.map(res =>
                            res.id === found.resId ? {
                                ...res,
                                images: res.images.map(img => String(img.id) === String(imageId) ? {
                                    ...img,
                                    path: newPath, // Update main path
                                    lensPath: null,
                                    enhancedPath: null, // Reset enhancement since base changed
                                    status: 'pending'
                                } : img)
                            } : res
                        ));
                    }
                } else {
                    console.error('Lens processing failed for', imageId, 'Error:', data.error, 'Details:', data.details);
                    if (data.error) alert(`Lens processing failed: ${data.error}`);
                }
            }
        } catch (error) {
            console.error('Batch lens processing error', error);
            alert('Failed to apply lens corrections');
        } finally {
            setIsEnhancing(false);
        }
    };

    const handleEditSave = async (newEdits) => {
        // newEdits: { [imageId]: { brightness: 10, ... } }
        // We don't save to state immediately because if we succeed, we overwrite the file (bake it)
        // and thus want to reset the sliders to 0.
        // setEditStates(prev => ({ ...prev, ...newEdits })); <--- REMOVED

        // Identify images to process (those in newEdits)
        const imagesToProcess = Object.keys(newEdits);

        setIsEnhancing(true);

        try {
            for (const imageId of imagesToProcess) {
                const found = findImageById(imageId);
                if (!found) continue;

                const adjustments = newEdits[imageId];
                // Only process if adjustments exist and are not all zero (optional optimization)

                // Determine the correct path to edit (what is currently visible)
                const sourcePath = found.img.enhancedPath || found.img.lensPath || found.img.path || found.img.originalPath;

                const response = await fetch('/api/edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagePath: sourcePath,
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

                    // Clear edit state (reset sliders) because changes are now baked into the file
                    setEditStates(prev => {
                        const next = { ...prev };
                        delete next[imageId];
                        return next;
                    });

                    if (found.type === 'primary') {
                        setPrimaries(prev => prev.map(o => String(o.id) === String(imageId) ? {
                            ...o,
                            path: newPath,
                            // Invalidate lens path because base changed. User must re-apply lens on new color base.
                            lensPath: null
                        } : o));
                    } else {
                        // handleUpdateResult expects index, but we have ID. 
                        // Let's manually update results state for robustness
                        setResults(prev => prev.map(res =>
                            res.id === found.resId ? {
                                ...res,
                                images: res.images.map(img => String(img.id) === String(imageId) ? {
                                    ...img,
                                    path: newPath,
                                    // Invalidate derived paths
                                    lensPath: null,
                                    enhancedPath: null,
                                    status: 'pending' // Reset status if it was processed
                                } : img)
                            } : res
                        ));
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Edit failed for', imageId, 'Status:', response.status, 'Error:', errorText);
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
        if (activeTabLabel === 'Primary') {
            primaries.forEach(o => {
                if (selectedImages.has(o.id)) {
                    selectedObjs.push(o);
                }
            });
        } else {
            const match = activeTabLabel.match(/(Version|Result) (\d+)/i);
            if (match) {
                const resId = parseInt(match[2]);
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
                    disabled={primaries.length === 0}
                    photoCount={primaries.length}
                    selectedCount={selectedImages.size}
                    activeTabLabel={activeTabLabel}
                    isEnhancing={isEnhancing}
                    onOpenPresetManager={() => setShowPresetManager(true)}
                    presetRefreshTrigger={presetRefreshTrigger}
                    onPresetSaved={() => setPresetRefreshTrigger(prev => prev + 1)}
                />
                <Gallery
                    primaries={primaries}
                    results={results}
                    onUpdateResult={handleUpdateResult}
                    onActiveTabChange={setActiveTabLabel}
                    selectedImages={selectedImages}
                    onToggleSelection={handleToggleSelection}
                    onDeselectAll={handleDeselectAll}
                    onDeleteSelected={handleDeleteSelected}
                    onRename={handleRename}

                    onEdit={() => setShowEditor(true)}
                    onLensEdit={() => setShowLensEditor(true)}
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

            {/* Lens Editor Modal */}
            {showLensEditor && (
                <LensEditorModal
                    isOpen={true}
                    onClose={() => setShowLensEditor(false)}
                    selectedImages={getSelectedImageObjects()}
                    onSave={handleLensSave}
                    savedLensSettings={lensStates}
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
