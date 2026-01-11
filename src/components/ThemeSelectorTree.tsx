import React, { useState, useMemo } from 'react';
import type { ThemeMeta } from '../types';

interface ThemeSelectorTreeProps {
    themes: ThemeMeta[];
    mode: 'checklist' | 'folder-select';

    // Checklist Mode Props
    selectedIds?: Set<string>;
    onToggle?: (id: string, isGroup: boolean) => void;

    // Exclude self/children (for Move Dialog to prevent cycles)
    excludeId?: string | null;

    // Folder Select Mode Props
    selectedFolderId?: string | null; // null = root
    onSelectFolder?: (id: string | null) => void;

    // Controlled Expansion Props
    expandedIds?: Set<string>;
    onToggleExpand?: (id: string) => void;
}

interface TreeNode {
    meta?: ThemeMeta; // undefined for root
    id: string; // 'root' or themeId
    children: TreeNode[];
    isGroup: boolean;
    name: string;
}

export function ThemeSelectorTree({
    themes,
    mode,
    selectedIds,
    onToggle,
    selectedFolderId,
    onSelectFolder,
    excludeId,
    expandedIds,      // Controlled prop
    onToggleExpand    // Controlled callback
}: ThemeSelectorTreeProps) {
    // Internal state (fallback if not controlled)
    const [internalExpandedIds, setInternalExpandedIds] = useState<Set<string>>(() => {
        const initial = new Set(['root']);
        themes.forEach(t => {
            if (t.isGroup) initial.add(t.id);
        });
        return initial;
    });

    const isControlled = expandedIds !== undefined;
    const currentExpandedIds = isControlled ? expandedIds : internalExpandedIds;

    // Build Tree Structure
    const tree = useMemo(() => {
        const root: TreeNode = { id: 'root', children: [], isGroup: true, name: 'Root' };
        const map = new Map<string, TreeNode>();

        // 1. Create Nodes
        themes.forEach(t => {
            map.set(t.id, {
                meta: t,
                id: t.id,
                children: [],
                isGroup: !!t.isGroup,
                name: t.name
            });
        });

        // 2. Build Hierarchy
        themes.forEach(t => {
            const node = map.get(t.id)!;
            const parentId = t.parentId;

            if (parentId && map.has(parentId)) {
                map.get(parentId)!.children.push(node);
            } else {
                root.children.push(node);
            }
        });

        return root;
    }, [themes]);

    const handleExpandToggle = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        if (isControlled) {
            onToggleExpand?.(id);
        } else {
            const newSet = new Set(internalExpandedIds);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            setInternalExpandedIds(newSet);
        }
    };

    const renderNode = (node: TreeNode, depth: number = 0) => {
        // Filter out excluded nodes (and their children)
        if (excludeId && (node.id === excludeId || (node.meta?.path?.startsWith(`local://${excludeId}`)))) return null;
        if (excludeId && node.id === excludeId) return null; // Simple check

        // Recursively check exclusion for children if needed, 
        // but typically "moving a parent into its child" is the cycle we avoid.
        // For simplicity: if node.id is excluded, we return null.

        // Filter leaf nodes in folder-select mode
        if (mode === 'folder-select' && !node.isGroup && node.id !== 'root') return null;

        const isExpanded = currentExpandedIds.has(node.id);
        const hasChildren = node.children.some(c => mode === 'checklist' || c.isGroup);

        const isSelected = mode === 'checklist'
            ? node.id !== 'root' && selectedIds?.has(node.id)
            : selectedFolderId === (node.id === 'root' ? null : node.id);

        const handleNodeClick = () => {
            if (mode === 'folder-select') {
                if (node.id === 'root') onSelectFolder?.(null);
                else onSelectFolder?.(node.id);
            } else {
                if (node.id !== 'root') onToggle?.(node.id, node.isGroup);
            }
        };

        return (
            <div key={node.id} className="select-none">
                <div
                    className={`
                        flex items-center p-2 rounded cursor-pointer transition-colors
                        ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50'}
                        ${depth > 0 ? 'ml-4' : ''}
                    `}
                    onClick={handleNodeClick}
                >
                    {/* Expander Arrow */}
                    <div
                        className={`w-6 h-6 flex items-center justify-center mr-1 text-slate-400 hover:text-slate-600 ${!hasChildren ? 'invisible' : ''}`}
                        onClick={(e) => handleExpandToggle(node.id, e)}
                    >
                        {isExpanded ? '▼' : '▶'}
                    </div>

                    {/* Checkbox (Checklist Mode Only) */}
                    {mode === 'checklist' && node.id !== 'root' && (
                        <div className={`
                            w-5 h-5 border rounded mr-3 flex items-center justify-center
                            ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}
                        `}>
                            {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                    )}

                    {/* Icon */}
                    <span className="mr-2 text-xl">
                        {node.id === 'root' ? '🏠' : (node.isGroup ? '📁' : '📝')}
                    </span>

                    {/* Name */}
                    <span className="truncate flex-1">
                        {node.id === 'root' ? 'Корень (Все темы)' : node.name}
                        {node.meta?.wordCount !== undefined && node.meta.wordCount > 0 &&
                            <span className="text-xs text-slate-400 ml-2">({node.meta.wordCount} сл.)</span>
                        }
                    </span>
                </div>

                {/* Children */}
                {isExpanded && node.children.length > 0 && (
                    <div className="border-l border-slate-100 ml-3">
                        {node.children.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="border border-slate-200 rounded-lg p-2 max-h-96 overflow-y-auto bg-white">
            {mode === 'folder-select' ? renderNode(tree) : tree.children.map(c => renderNode(c))}
            {/* In checklist mode, usually we don't show root as a selectable item, just its children */}
        </div>
    );
}
