'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import UploadZone from '@/components/UploadZone';
import ControlPanel from '@/components/ControlPanel';
import Gallery from '@/components/Gallery';
import PresetManagementModal from '@/components/PresetManagementModal';

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
    const abortControllerRef = useRef(null);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            router.push('/login');
        }
    }, [user, loading, router]);

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
                path: file.path,
                originalName: file.originalName, // Keep true original name for reference
                displayName: displayOriginalName, // Use updated name for UI
                uploadedAt: Date.now()
            };
        });
        setOriginals(prev => [...prev, ...newOriginals]);
    };


    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsEnhancing(false);
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
            sourceImages = originals.map(orig => ({
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
                        instructions
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
                    // Optionally update status to 'cancelled' if you want to show that
                    setResults(prev => prev.map(result =>
                        result.id === newResultId ? {
                            ...result,
                            images: result.images.map((img, i) =>
                                i === index ? { ...img, status: 'pending' } : img // Revert to pending
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
        }
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
                />
                <ControlPanel
                    onEnhance={handleEnhance}
                    disabled={originals.length === 0}
                    photoCount={originals.length}
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
                />
            </div>

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
