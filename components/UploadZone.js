'use client';

import { useState, useRef } from 'react';

export default function UploadZone({ onUploadComplete }) {
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
                backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            <input
                type="file"
                multiple
                accept="image/*"
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
