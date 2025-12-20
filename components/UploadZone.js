'use client';

import { useState, useRef } from 'react';

export default function UploadZone({ onUploadComplete, onReset, onStop, isProcessing }) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await uploadFiles(e.dataTransfer.files);
        }
    };

    const handleFileSelect = async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            await uploadFiles(e.target.files);
        }
    };

    const uploadFiles = async (fileList) => {
        setIsUploading(true);
        const formData = new FormData();

        for (let i = 0; i < fileList.length; i++) {
            formData.append('files', fileList[i]);
        }

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            if (onUploadComplete) {
                onUploadComplete(data.files);
            }
        } catch (error) {
            console.error('Error uploading files:', error);
            alert('Failed to upload files');
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleClick = () => {
        if (window.electron) {
            handleElectronUpload();
        } else {
            fileInputRef.current?.click();
        }
    };

    const handleElectronUpload = async () => {
        try {
            const result = await window.electron.openFileDialog();
            if (!result.canceled && result.files.length > 0) {
                const files = result.files.map(f => dataURLtoFile(f.data, f.name));
                await uploadFiles(files);
            }
        } catch (error) {
            console.error('Electron upload error:', error);
            alert('Failed to open file dialog');
        }
    };

    const dataURLtoFile = (dataurl, filename) => {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
    };

    return (
        <div
            className={`glass ${isDragging ? 'dragging' : ''}`}
            style={{
                padding: '3rem',
                borderRadius: 'var(--radius)',
                border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--border)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                position: 'relative'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            {onReset && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onReset();
                    }}
                    title="Start Over (Clear All Photos)"
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--secondary)',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        zIndex: 10
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--error)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--secondary)'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                        <path d="M3 3v5h5" />
                    </svg>
                    Start Over
                </button>
            )}

            {isProcessing && onStop && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onStop();
                    }}
                    title="Stop Processing"
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: onReset ? '8rem' : '1rem', // Adjust position based on Start Over existence
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--error)',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        zIndex: 10
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.fontWeight = 'bold'}
                    onMouseLeave={(e) => e.currentTarget.style.fontWeight = 'normal'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    </svg>
                    Stop
                </button>
            )}

            <input
                type="file"
                multiple
                accept="image/*,.heic,.heif"
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: 'none' }}
            />

            {isUploading ? (
                <div style={{ color: 'var(--primary)' }}>Uploading...</div>
            ) : (
                <>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
                    <h3 style={{ marginBottom: '0.5rem' }}>Drag & Drop Photos Here</h3>
                    <p style={{ color: 'var(--secondary)' }}>or click to browse</p>
                </>
            )}
        </div>
    );
}
