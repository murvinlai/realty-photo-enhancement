'use client';

import { useNotification } from '@/contexts/NotificationContext';

export default function NotificationSystem() {
    const { notifications, removeNotification } = useNotification();

    if (notifications.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            zIndex: 9999,
            width: '90%',
            maxWidth: '600px',
            pointerEvents: 'none' // Allow clicking through the container, enabling events on children
        }}>
            {notifications.map(note => (
                <div
                    key={note.id}
                    className={`notification-toast level-${note.level}`}
                    style={{
                        pointerEvents: 'auto', // Re-enable clicks
                        padding: '1rem 1.5rem',
                        borderRadius: '0.75rem',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        border: '1px solid',
                        backdropFilter: 'blur(10px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        animation: 'slideUp 0.3s ease-out',
                        ...stylesByLevel[note.level]
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{iconByLevel[note.level]}</span>
                        <div>
                            <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.8, marginBottom: '0.2rem' }}>
                                {labelByLevel[note.level]}
                            </div>
                            <div style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>
                                {note.message}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => removeNotification(note.id)}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: 'inherit',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            marginLeft: '1rem',
                            flexShrink: 0
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}
            <style jsx global>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}

const stylesByLevel = {
    success: {
        background: 'rgba(16, 185, 129, 0.9)', // Green
        borderColor: 'rgba(52, 211, 153, 0.5)',
        color: 'white'
    },
    normal: {
        background: 'rgba(59, 130, 246, 0.9)', // Blue
        borderColor: 'rgba(96, 165, 250, 0.5)',
        color: 'white'
    },
    major: {
        background: 'rgba(245, 158, 11, 0.95)', // Orange/Amber
        borderColor: 'rgba(251, 191, 36, 0.5)',
        color: 'white'
    },
    critical: {
        background: 'rgba(239, 68, 68, 1)', // Red
        borderColor: 'rgba(248, 113, 113, 0.5)',
        color: 'white',
        boxShadow: '0 0 30px rgba(239, 68, 68, 0.4)' // Glow
    }
};

const iconByLevel = {
    success: '✅',
    normal: 'ℹ️',
    major: '⚠️',
    critical: '🚨'
};

const labelByLevel = {
    success: 'Success',
    normal: 'Info',
    major: 'Warning',
    critical: 'Critical Error'
};
