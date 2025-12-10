'use client';

import { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);

    // Level: 'success', 'normal' (info), 'major' (warning), 'critical' (error)
    const addNotification = useCallback((message, level = 'normal') => {
        const id = Date.now() + Math.random();

        // Auto-dismiss logic based on level
        let timeoutId;
        if (level === 'success') {
            timeoutId = setTimeout(() => removeNotification(id), 3000);
        } else if (level === 'normal') {
            timeoutId = setTimeout(() => removeNotification(id), 5000);
        }
        // Major and Critical do NOT auto-dismiss (require user action)

        const newNotification = {
            id,
            message,
            level,
            timestamp: new Date(),
            timeoutId
        };

        setNotifications(prev => [...prev, newNotification]);
    }, []);

    const removeNotification = useCallback((id) => {
        setNotifications(prev => {
            const output = prev.filter(n => n.id !== id);
            // Clear timeout if exists to prevent memory leaks (though minor here)
            const target = prev.find(n => n.id === id);
            if (target && target.timeoutId) clearTimeout(target.timeoutId);
            return output;
        });
    }, []);

    return (
        <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
}
