'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/contexts/NotificationContext';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Item Component
function SortablePresetItem({ preset, isEditing, onEdit, onDelete, onDuplicate, onToggleFavorite }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: preset.id, disabled: false });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        padding: '1rem',
        borderRadius: '0.75rem',
        background: preset.is_global ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isEditing ? 'var(--primary)' : 'var(--border)'}`,
        position: 'relative',
        height: '100%',
        cursor: 'grab',
        touchAction: 'none' // Required for pointer sensors
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ color: preset.is_global ? 'var(--primary)' : 'white' }}>{preset.name}</strong>
                <button
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag on click
                    onClick={() => onToggleFavorite(preset)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', opacity: preset.is_favorite ? 1 : 0.3 }}
                >
                    {preset.is_favorite ? '❤️' : '🤍'}
                </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginBottom: '1rem', height: '2.5em', overflow: 'hidden' }}>
                {preset.description}
            </p>

            {!preset.is_global && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }} onPointerDown={(e) => e.stopPropagation()}>
                    <button onClick={() => onEdit(preset)} style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '0.25rem', color: 'white', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => onDuplicate(preset)} style={{ padding: '0.4rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '0.25rem', color: 'white', cursor: 'pointer' }}>Copy</button>
                    <button onClick={() => onDelete(preset.id)} style={{ padding: '0.4rem', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '0.25rem', color: 'var(--error)', cursor: 'pointer' }}>Del</button>
                </div>
            )}
            {preset.is_global && (
                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontStyle: 'italic', marginTop: 'auto' }}>Global Preset (Fixed)</div>
            )}
        </div>
    );
}

export default function PresetManagementModal({ isOpen, onClose, onRefresh }) {
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addNotification } = useNotification();
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', description: '', instructions: '' });
    const [isCreating, setIsCreating] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (isOpen) {
            fetchPresets();
            setIsCreating(false);
            setEditingId(null);
        }
    }, [isOpen]);

    const fetchPresets = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase
                .from('enhancement_presets')
                .select('*')
                .or(`is_global.eq.true,user_id.eq.${user?.id}`)
                // .order('is_global', { ascending: false }) // Removed to allow mixing
                .order('order_index', { ascending: true }) // Primary sort
                .order('created_at', { ascending: false }); // Fallback

            if (error) throw error;
            setPresets(data || []);
        } catch (error) {
            console.error('Error fetching manage presets:', error);
            addNotification('Failed to load presets for management', 'major');
        } finally {
            setLoading(false);
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setPresets((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);

                const newItems = arrayMove(items, oldIndex, newIndex);

                // Persist order to DB
                updateOrderInDB(newItems);

                return newItems;
            });
        }
    };

    const updateOrderInDB = async (items) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Filter out global presets first
            const userItems = items.filter(item => !item.is_global);

            if (userItems.length === 0) return;

            // We must include user_id to satisfy the INSERT policy logic of upsert
            // mapping index from the ORIGINAL list's relative position would be complex if mixed,
            // but here we just want to save the order they appear in the UI.
            // If the UI shows Global -> User1 -> User2, and we only save User1 and User2...
            // User1 gets index 0? No, we should probably preserve the index from the 'items' array?
            // Actually, if we only save the user items, their relative order matters.
            // Let's just give them the index in the *filtered* list or the *actual* list?
            // If we use the index from 'items', we might have gaps (0, 2, 3). 'order_index' being an int allows gaps.
            // So mapping from the main 'items' index is safer to maintain mix.

            const updates = items
                .map((item, index) => {
                    return {
                        id: item.id,
                        order_index: index,
                        user_id: item.user_id || user.id, // Preserve original owner (e.g. admin) or default to current
                        is_global: item.is_global, // Preserve global status
                        name: item.name,
                        description: item.description,
                        settings: item.settings
                    };
                })
                .filter(Boolean);

            if (updates.length === 0) return;

            const { error } = await supabase.from('enhancement_presets').upsert(
                updates,
                { onConflict: 'id' }
            );

            if (error) throw error;
            // Notify parent to refresh widget order if it relies on this
            onRefresh && onRefresh();

        } catch (error) {
            console.error('Failed to save order:', error);
            addNotification('Failed to save new order: ' + error.message, 'major');
        }
    };

    const handleEdit = (preset) => {
        setEditingId(preset.id);
        setEditForm({
            name: preset.name,
            description: preset.description || '',
            instructions: preset.settings?.instructions || ''
        });
        setIsCreating(false);
    };

    // ... (rest of CRUD handlers same as before) 
    const handleCreate = () => {
        setEditingId(null);
        setEditForm({ name: '', description: '', instructions: '' });
        setIsCreating(true);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setIsCreating(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return addNotification('You must be logged in', 'major');

        try {
            if (isCreating) {
                const { error } = await supabase.from('enhancement_presets').insert({
                    user_id: user.id,
                    name: editForm.name,
                    description: editForm.description,
                    settings: { instructions: editForm.instructions },
                    is_global: false,
                    order_index: presets.length // Add to end
                });
                if (error) throw error;
                addNotification('Preset created!', 'success');
            } else {
                const { error } = await supabase.from('enhancement_presets')
                    .update({
                        name: editForm.name,
                        description: editForm.description,
                        settings: { instructions: editForm.instructions }
                    })
                    .eq('id', editingId)
                    .eq('user_id', user.id);
                if (error) throw error;
                addNotification('Preset updated!', 'success');
            }

            fetchPresets();
            onRefresh();
            handleCancelEdit();

        } catch (error) {
            addNotification(error.message, 'major');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this preset?')) return;
        try {
            const { error } = await supabase.from('enhancement_presets').delete().eq('id', id);
            if (error) throw error;
            addNotification('Preset deleted.', 'success');
            fetchPresets();
            onRefresh();
        } catch (error) {
            addNotification('Delete failed: ' + error.message, 'major');
        }
    };

    const toggleFavorite = async (preset) => {
        try {
            const newStatus = !preset.is_favorite;
            setPresets(prev => prev.map(p => p.id === preset.id ? { ...p, is_favorite: newStatus } : p));
            const { error } = await supabase
                .from('enhancement_presets')
                .update({ is_favorite: newStatus })
                .eq('id', preset.id);
            if (error) throw error;
            onRefresh();
        } catch (error) {
            addNotification('Failed to toggle favorite', 'major');
            fetchPresets();
        }
    };

    const handleDuplicate = async (preset) => {
        const { data: { user } } = await supabase.auth.getUser();
        try {
            const { error } = await supabase.from('enhancement_presets').insert({
                user_id: user.id,
                name: `${preset.name} (Copy)`,
                description: preset.description,
                settings: preset.settings,
                is_global: false,
                order_index: presets.length
            });
            if (error) throw error;
            addNotification('Preset duplicated!', 'success');
            fetchPresets();
            onRefresh();
        } catch (error) {
            addNotification(error.message, 'major');
        }
    };

    const applyDefaultSort = async () => {
        addNotification('Applying default sort...', 'normal');
        fetchPresets(); // Just re-fetch default
    };

    if (!isOpen) return null;

    // Filter out globals from sortable list if we don't want them draggable
    // Or include them but disable dragging in the item component
    const draggableItems = presets.map(p => p.id);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)', zIndex: 60, display: 'flex',
            alignItems: 'center', justifyContent: 'center'
        }}>
            <div className="glass" style={{
                width: '95%', maxWidth: '1000px', height: '85vh',
                borderRadius: '1rem', display: 'flex', flexDirection: 'column',
                background: '#0f172a', border: '1px solid var(--border)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}>
                {/* Header */}
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Manage Presets</h2>
                        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--secondary)', fontSize: '0.9rem' }}>
                            Drag to reorder, edit properties, or manage favorites. Order is saved automatically.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={applyDefaultSort} style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'var(--secondary)', cursor: 'pointer' }}>
                            Reset Sort
                        </button>
                        <button onClick={handleCreate} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', border: 'none', borderRadius: '0.5rem', color: 'white', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}>
                            + Create New
                        </button>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>

                    {(isCreating || editingId) && (
                        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(30, 41, 59, 0.9)', borderRadius: '0.75rem', border: '1px solid var(--primary)' }}>
                            <h4 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--primaryIcon)' }}>{isCreating ? 'Create New Preset' : 'Edit Preset'}</h4>
                            <form onSubmit={handleSave}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <input required placeholder="Preset Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'white' }} />
                                    <input placeholder="Short Description" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'white' }} />
                                </div>
                                <textarea required placeholder="AI Instructions..." value={editForm.instructions} onChange={e => setEditForm({ ...editForm, instructions: e.target.value })} rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'white', marginBottom: '1rem', fontFamily: 'monospace' }} />
                                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                    <button type="button" onClick={handleCancelEdit} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: '0.5rem', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" style={{ padding: '0.5rem 1.5rem', background: 'var(--success)', border: 'none', borderRadius: '0.5rem', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>Save Changes</button>
                                </div>
                            </form>
                        </div>
                    )}

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={draggableItems}
                            strategy={rectSortingStrategy}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', paddingBottom: '2rem' }}>
                                {presets.map(p => (
                                    <SortablePresetItem
                                        key={p.id}
                                        preset={p}
                                        isEditing={p.id === editingId}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                        onDuplicate={handleDuplicate}
                                        onToggleFavorite={toggleFavorite}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </div>
        </div>
    );
}
