import { useState, useEffect } from 'react';
import type { ThemeMeta, ThemeContent, Word } from '../types';
import { DataManager } from '../lib/data-manager';
import { ConfirmDialog } from './ConfirmDialog';
import { ThemeSelectorTree } from './ThemeSelectorTree';

interface DatabaseEditorProps {
    onBack: () => void;
}

export function DatabaseEditor({ onBack }: DatabaseEditorProps) {
    const [themes, setThemes] = useState<ThemeMeta[]>([]);
    const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
    const [activeThemeContent, setActiveThemeContent] = useState<ThemeContent | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // New Word State
    const [newVal0, setNewVal0] = useState('');
    const [newVal1, setNewVal1] = useState('');

    // New Theme State
    const [isCreating, setIsCreating] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newThemeName, setNewThemeName] = useState('');

    // Tree State
    // Default to fully expanded tree
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

    // Auto-expand all groups when themes load
    useEffect(() => {
        if (themes.length > 0) {
            setExpandedIds(prev => {
                const next = new Set(prev);
                themes.forEach(t => {
                    if (t.isGroup) next.add(t.id);
                });
                return next;
            });
        }
    }, [themes]);

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    useEffect(() => {
        loadThemes();
    }, []);

    const loadThemes = () => {
        DataManager.getThemes().then(setThemes);
    };

    const handleSelectTheme = async (theme: ThemeMeta) => {
        setSelectedThemeId(theme.id);

        // If it's a group, we don't load "content" (words)
        if (theme.isGroup) {
            setActiveThemeContent(null);
            return;
        }

        setIsLoading(true);
        try {
            const content = await DataManager.loadTheme(theme.path);
            setActiveThemeContent(content);
        } catch (e) {
            console.error(e);
            alert("Ошибка загрузки темы");
        } finally {
            setIsLoading(false);
        }
    };

    // Existing handleCreateTheme
    const handleCreateTheme = () => {
        if (!newThemeName.trim()) return;

        const id = 'custom_' + Date.now();
        let parentId: string | undefined = undefined;
        if (selectedThemeId) {
            const selected = themes.find(t => t.id === selectedThemeId);
            if (selected?.isGroup) parentId = selected.id;
            else if (selected?.parentId) parentId = selected.parentId; // Sibling
        }

        const meta: ThemeMeta = {
            id,
            pair: 'ru-en',
            name: newThemeName,
            path: `local://${id}`,
            parentId
        };

        const content: ThemeContent = {
            id,
            pair: ['ru', 'en'],
            words: []
        };

        DataManager.saveTheme(meta, content);

        // Auto-expand parent if exists
        if (parentId) {
            setExpandedIds(prev => new Set(prev).add(parentId!));
        }

        loadThemes();
        setIsCreating(false);
        setNewThemeName('');
        handleSelectTheme(meta);
    };

    const handleCreateGroup = () => {
        if (!newThemeName.trim()) return;

        // Logic to determine parent
        let parentId: string | undefined = undefined;
        if (selectedThemeId) {
            const selected = themes.find(t => t.id === selectedThemeId);
            if (selected?.isGroup) parentId = selected.id;
            else if (selected?.parentId) parentId = selected.parentId;
        }

        DataManager.createGroup(newThemeName, parentId);

        if (parentId) {
            setExpandedIds(prev => new Set(prev).add(parentId!));
        }

        loadThemes();
        setIsCreatingGroup(false);
        setNewThemeName('');
    };

    const handleAddWord = () => {
        if (!activeThemeContent || !newVal0.trim() || !newVal1.trim()) return;

        // Only allow editing if it is a local theme (for V1 simplicity)
        const isLocal = themes.find(t => t.id === selectedThemeId)?.path.startsWith('local://');
        if (!isLocal) {
            alert("Редактирование встроенных тем пока недоступно. Создайте свою тему.");
            return;
        }

        const newWord: Word = {
            id: 'w_' + Date.now(),
            val: [newVal0, newVal1]
        };

        const newContent = {
            ...activeThemeContent,
            words: [...activeThemeContent.words, newWord]
        };

        const meta = themes.find(t => t.id === selectedThemeId)!;
        DataManager.saveTheme(meta, newContent);
        setActiveThemeContent(newContent);
        setNewVal0('');
        setNewVal1('');
    };

    const handleDeleteWord = (wordId: string) => {
        if (!activeThemeContent) return;
        const isLocal = themes.find(t => t.id === selectedThemeId)?.path.startsWith('local://');
        if (!isLocal) return;

        const newContent = {
            ...activeThemeContent,
            words: activeThemeContent.words.filter(w => w.id !== wordId)
        };

        const meta = themes.find(t => t.id === selectedThemeId)!;
        DataManager.saveTheme(meta, newContent);
        setActiveThemeContent(newContent);
    };

    const handleExport = () => {
        if (!activeThemeContent) return;
        const blob = new Blob([JSON.stringify(activeThemeContent, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeThemeContent.id}_export.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDuplicateTheme = async (sourceId: string) => {
        if (!activeThemeContent) return;

        const sourceTheme = themes.find(t => t.id === sourceId);
        const newName = (sourceTheme?.name || 'Theme') + ' (Copy)';
        const newId = 'custom_' + Date.now();

        const meta: ThemeMeta = {
            id: newId,
            pair: 'ru-en',
            name: newName,
            path: `local://${newId}`,
            parentId: sourceTheme?.parentId // Inherit parent
        };

        const content: ThemeContent = {
            id: newId,
            pair: activeThemeContent.pair,
            words: [...activeThemeContent.words]
        };

        DataManager.saveTheme(meta, content);
        await LoadThemesAndSelect(meta);
    };

    const [isEditingName, setIsEditingName] = useState(false);

    const handleSaveRename = () => {
        if (!newThemeName.trim() || !activeThemeContent || !selectedThemeId) {
            setIsEditingName(false);
            return;
        }

        const oldMeta = themes.find(t => t.id === selectedThemeId)!;
        const newMeta = { ...oldMeta, name: newThemeName };

        DataManager.saveTheme(newMeta, activeThemeContent);

        // Update local list instantly
        setThemes(prev => prev.map(t => t.id === selectedThemeId ? newMeta : t));
        setIsEditingName(false);
    };

    const [confirmDeleteThemeId, setConfirmDeleteThemeId] = useState<string | null>(null);

    const handleDeleteTheme = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setConfirmDeleteThemeId(id);
    };

    const performDeleteTheme = () => {
        if (!confirmDeleteThemeId) return;

        DataManager.deleteTheme(confirmDeleteThemeId);

        // Refresh
        DataManager.getThemes().then(loaded => {
            setThemes(loaded);
            if (selectedThemeId === confirmDeleteThemeId) {
                setSelectedThemeId(null);
                setActiveThemeContent(null);
            }
            setConfirmDeleteThemeId(null);
        });
    };

    // Helper to reload and select
    const LoadThemesAndSelect = async (meta: ThemeMeta) => {
        const loaded = await DataManager.getThemes();
        setThemes(loaded);
        handleSelectTheme(meta);
    };

    const isLocalSelected = themes.find(t => t.id === selectedThemeId)?.path.startsWith('local://');

    // --- Bulk Ops State ---
    const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [moveTargetId, setMoveTargetId] = useState<string>('');
    // Theme Moving
    const [isMoveThemeModalOpen, setIsMoveThemeModalOpen] = useState(false);
    const [moveThemeTargetId, setMoveThemeTargetId] = useState<string>('');
    const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);

    useEffect(() => {
        setSelectedWordIds(new Set()); // Reset selection when theme changes
    }, [selectedThemeId]);

    const toggleWordSelection = (id: string, select: boolean) => {
        const newSet = new Set(selectedWordIds);
        if (select) newSet.add(id);
        else newSet.delete(id);
        setSelectedWordIds(newSet);
    };

    const toggleSelectAll = () => {
        if (!activeThemeContent) return;
        if (selectedWordIds.size === activeThemeContent.words.length) {
            setSelectedWordIds(new Set());
        } else {
            setSelectedWordIds(new Set(activeThemeContent.words.map(w => w.id)));
        }
    };

    const handleBulkDelete = () => {
        if (!activeThemeContent) return;
        if (!confirm(`Удалить ${selectedWordIds.size} слов?`)) return;

        const newContent = {
            ...activeThemeContent,
            words: activeThemeContent.words.filter(w => !selectedWordIds.has(w.id))
        };
        const meta = themes.find(t => t.id === selectedThemeId)!;
        DataManager.saveTheme(meta, newContent);
        setActiveThemeContent(newContent);
        setSelectedWordIds(new Set());
    };

    const handleBulkMove = () => {
        if (!activeThemeContent || !moveTargetId) return;

        // 1. Load target theme
        const targetMeta = themes.find(t => t.id === moveTargetId);
        if (!targetMeta) return;

        DataManager.loadTheme(targetMeta.path).then(targetContent => {
            // 2. Add words to target
            const wordsToMove = activeThemeContent.words.filter(w => selectedWordIds.has(w.id));
            const newTargetContent = {
                ...targetContent,
                words: [...targetContent.words, ...wordsToMove]
            };
            DataManager.saveTheme(targetMeta, newTargetContent);

            // 3. Remove from source
            const newSourceContent = {
                ...activeThemeContent,
                words: activeThemeContent.words.filter(w => !selectedWordIds.has(w.id))
            };
            const meta = themes.find(t => t.id === selectedThemeId)!;
            DataManager.saveTheme(meta, newSourceContent);

            // 4. Update UI
            setActiveThemeContent(newSourceContent);
            setSelectedWordIds(new Set());
            setIsMoveModalOpen(false);
        });
    };

    const handleBulkKeep = () => {
        if (!activeThemeContent) return;
        if (!confirm(`Оставить только ${selectedWordIds.size} слов и удалить остальные?`)) return;

        const newContent = {
            ...activeThemeContent,
            words: activeThemeContent.words.filter(w => selectedWordIds.has(w.id))
        };
        const meta = themes.find(t => t.id === selectedThemeId)!;
        DataManager.saveTheme(meta, newContent);
        setActiveThemeContent(newContent);
        setSelectedWordIds(new Set()); // Clear selection to hide FAB
    };

    const handleMoveTheme = () => {
        if (!selectedThemeId || !moveThemeTargetId) return;

        const themeToMove = themes.find(t => t.id === selectedThemeId);
        if (!themeToMove) return;

        // Prevent moving folder into itself or children (basic check)
        if (themeToMove.id === moveThemeTargetId) {
            alert("Нельзя переместить папку в саму себя");
            return;
        }

        const newMeta = {
            ...themeToMove,
            parentId: moveThemeTargetId === 'root' ? undefined : moveThemeTargetId
        };

        // We only need to update the meta list/storage, content remains same
        // But DataManager.saveTheme requires content. 
        // If it's a group, content is implicit/null. Only meta updates.
        // If it's a file, we need content.

        if (themeToMove.isGroup) {
            // Special case for group meta update? DataManager.saveTheme handles groups?
            // Actually saveTheme expects content. 
            // We might need a DataManager.updateThemeMeta(meta) but saveTheme works if we pass empty content for group?
            // Checking saveTheme implementation... it writes to file if path exists. Groups have empty path.
            // It updates the "custom themes" list regardless.
            DataManager.saveTheme(newMeta, { id: newMeta.id, pair: newMeta.pair.split('-') as any, words: [] });
        } else {
            DataManager.saveTheme(newMeta, activeThemeContent!);
        }

        setThemes(prev => prev.map(t => t.id === selectedThemeId ? newMeta : t));
        setIsMoveThemeModalOpen(false);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] max-h-[800px] bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden relative">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div className="flex items-center">
                    <button onClick={onBack} className="mr-4 px-3 py-1 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800">
                        ← Назад
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">Редактор Базы 2.0</h2>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar: Theme List */}
                <div className="w-1/3 border-r border-slate-100 bg-slate-50 overflow-y-auto p-4 flex flex-col">
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setIsCreating(true)}
                            className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm text-sm"
                        >
                            + Тема
                        </button>
                        <button
                            onClick={() => setIsCreatingGroup(true)}
                            className="flex-1 py-1 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 shadow-sm text-sm"
                        >
                            + Папка
                        </button>
                        <button
                            onClick={() => setIsCleanupModalOpen(true)}
                            className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 shadow-sm"
                            title="Все пользовательские файлы (Очистка)"
                        >
                            🗑️
                        </button>
                    </div>

                    {/* Cleanup Modal */}
                    {isCleanupModalOpen && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                            <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-full m-4 max-h-[80vh] flex flex-col">
                                <h3 className="text-xl font-bold mb-4">Все ваши темы</h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    Если файл не виден в дереве, удалите его здесь.
                                </p>
                                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-lg mb-4 p-2">
                                    {themes.filter(t => t.path.startsWith('local://')).map(t => (
                                        <div key={t.id} className="flex justify-between items-center p-2 hover:bg-slate-50 border-b border-slate-50 last:border-0">
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="font-medium truncate">{t.name}</span>
                                                <span className="text-xs text-slate-400">{t.id}</span>
                                            </div>
                                            <button
                                                onClick={(e) => handleDeleteTheme(e, t.id)}
                                                className="text-red-500 hover:text-red-700 px-2 font-bold"
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    ))}
                                    {themes.filter(t => t.path.startsWith('local://')).length === 0 && (
                                        <div className="text-center text-slate-400 py-4">Нет пользовательских тем</div>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={() => setIsCleanupModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300">
                                        Закрыть
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Creation Form */}
                    {(isCreating || isCreatingGroup) && (
                        <div className="mb-4 p-3 bg-white rounded-lg border border-blue-200">
                            <div className="text-xs font-bold text-slate-400 mb-2">
                                {isCreatingGroup ? 'Новая папка' : 'Новая тема'}
                                {selectedThemeId && themes.find(t => t.id === selectedThemeId)?.isGroup && (
                                    <span className="text-blue-500"> в {themes.find(t => t.id === selectedThemeId)?.name}</span>
                                )}
                            </div>
                            <input
                                className="w-full p-2 border rounded mb-2 text-sm"
                                placeholder="Название..."
                                value={newThemeName}
                                onChange={e => setNewThemeName(e.target.value)}
                                autoFocus
                            />
                            <div className="flex space-x-2">
                                <button onClick={isCreatingGroup ? handleCreateGroup : handleCreateTheme} className="flex-1 bg-green-500 text-white text-xs py-1 rounded">Создать</button>
                                <button onClick={() => { setIsCreating(false); setIsCreatingGroup(false); }} className="flex-1 bg-slate-200 text-slate-600 text-xs py-1 rounded">Отмена</button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <ThemeTree
                            themes={themes}
                            parentId={undefined}
                            selectedId={selectedThemeId}
                            onSelect={handleSelectTheme}
                            onDelete={handleDeleteTheme}
                            expandedIds={expandedIds}
                            toggleExpand={toggleExpand}
                        />
                    </div>
                </div>

                {/* Main: Word List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {!selectedThemeId ? (
                        <div className="h-full flex items-center justify-center text-slate-400">
                            Выберите тему для редактирования
                        </div>
                    ) : isLoading ? (
                        <div className="p-10 text-center">Загрузка...</div>
                    ) : activeThemeContent ? (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center space-x-3">
                                    {isLocalSelected && isEditingName ? (
                                        <div className="flex items-center">
                                            <input
                                                autoFocus
                                                value={newThemeName}
                                                onChange={e => setNewThemeName(e.target.value)}
                                                onBlur={handleSaveRename}
                                                onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
                                                className="text-2xl font-bold border-b-2 border-blue-500 outline-none text-slate-800"
                                            />
                                            <button onClick={handleSaveRename} className="ml-2 text-green-600">✓</button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center group">
                                            <h3 className="text-2xl font-bold">{themes.find(t => t.id === selectedThemeId)?.name}</h3>
                                            {isLocalSelected && (
                                                <button
                                                    onClick={() => {
                                                        const t = themes.find(t => t.id === selectedThemeId);
                                                        setNewThemeName(t?.name || '');
                                                        setIsEditingName(true);
                                                    }}
                                                    className="ml-3 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 transition-opacity"
                                                    title="Переименовать"
                                                >
                                                    ✏️
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="space-x-2 flex">
                                    <button onClick={handleExport} className="px-3 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 text-sm">
                                        JSON Export
                                    </button>
                                    <button
                                        onClick={() => setIsMoveThemeModalOpen(true)}
                                        className="px-3 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 text-sm"
                                    >
                                        Переместить
                                    </button>
                                    <button
                                        onClick={() => handleDuplicateTheme(selectedThemeId!)}
                                        className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-sm font-medium"
                                        title="Создать копию для редактирования"
                                    >
                                        Копировать
                                    </button>
                                </div>
                            </div>

                            {!isLocalSelected && (
                                <div className="mb-6 p-4 bg-orange-50 text-orange-700 rounded-xl text-sm border border-orange-100">
                                    Встроенная тема (только чтение). Чтобы редактировать, нажмите "Копировать".
                                </div>
                            )}

                            {isLocalSelected && (
                                <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200 flex space-x-3 items-end">
                                    <div className="flex-1">
                                        <label className="text-xs text-slate-500 font-bold uppercase">Слово (Ru)</label>
                                        <input
                                            className="w-full p-2 border rounded-lg"
                                            value={newVal0}
                                            onChange={e => setNewVal0(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-slate-500 font-bold uppercase">Перевод (En)</label>
                                        <input
                                            className="w-full p-2 border rounded-lg"
                                            value={newVal1}
                                            onChange={e => setNewVal1(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddWord}
                                        className="h-[42px] px-6 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700"
                                    >
                                        Добавить
                                    </button>
                                </div>
                            )}

                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-slate-100 text-slate-400 text-sm">
                                        {isLocalSelected && (
                                            <th className="py-2 w-10 text-center">
                                                <input
                                                    type="checkbox"
                                                    onChange={toggleSelectAll}
                                                    checked={activeThemeContent?.words.length > 0 && selectedWordIds.size === activeThemeContent.words.length}
                                                />
                                            </th>
                                        )}
                                        <th className="py-2">RU</th>
                                        <th className="py-2">EN</th>
                                        {isLocalSelected && <th className="py-2 w-10"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeThemeContent.words.map(w => (
                                        <tr key={w.id} className={`border-b border-slate-50 hover:bg-slate-50 group ${selectedWordIds.has(w.id) ? 'bg-blue-50' : ''}`}>
                                            {isLocalSelected && (
                                                <td className="py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedWordIds.has(w.id)}
                                                        onChange={(e) => toggleWordSelection(w.id, e.target.checked)}
                                                    />
                                                </td>
                                            )}
                                            <td className="py-3 font-medium text-slate-800">{w.val[0]}</td>
                                            <td className="py-3 text-slate-600">{w.val[1]}</td>
                                            {isLocalSelected && (
                                                <td className="py-3 text-right">
                                                    <button
                                                        onClick={() => handleDeleteWord(w.id)}
                                                        className="text-red-400 hover:text-red-600 font-bold opacity-0 group-hover:opacity-100"
                                                    >
                                                        ×
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                    {activeThemeContent.words.length === 0 && (
                                        <tr><td colSpan={4} className="py-8 text-center text-slate-400">Пусто</td></tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Space for FAB */}
                            <div className="h-20"></div>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Floating Action Bar */}
            {selectedWordIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center space-x-6 z-20 animate-slide-up">
                    <span className="font-bold">{selectedWordIds.size} выбрано</span>
                    <div className="h-6 w-px bg-slate-700"></div>

                    <button onClick={handleBulkKeep} className="hover:text-green-300 font-medium flex items-center gap-2" title="Удалить всё, КРОМЕ выбранного">
                        <span>🛡️</span> Оставить
                    </button>

                    <button onClick={() => setIsMoveModalOpen(true)} className="hover:text-blue-300 font-medium flex items-center gap-2">
                        <span>↗</span> Переместить
                    </button>
                    <button onClick={handleBulkDelete} className="hover:text-red-400 font-medium flex items-center gap-2">
                        <span>×</span> Удалить
                    </button>
                    <button onClick={() => setSelectedWordIds(new Set())} className="text-slate-500 hover:text-white text-sm">
                        Сброс
                    </button>
                </div>
            )}

            {/* Move Modal */}
            {isMoveModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-full m-4">
                        <h3 className="text-xl font-bold mb-4">Переместить в...</h3>
                        <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-lg mb-4">
                            {themes
                                .filter(t => t.path.startsWith('local://') && !t.isGroup && t.id !== selectedThemeId)
                                .map(t => (
                                    <div
                                        key={t.id}
                                        onClick={() => setMoveTargetId(t.id)}
                                        className={`p-3 cursor-pointer rounded hover:bg-slate-50 ${moveTargetId === t.id ? 'bg-blue-50 text-blue-700 font-bold' : ''}`}
                                    >
                                        {t.name}
                                    </div>
                                ))
                            }
                            {themes.filter(t => t.path.startsWith('local://') && !t.isGroup && t.id !== selectedThemeId).length === 0 && (
                                <div className="p-4 text-center text-gray-400">Нет доступных тем</div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsMoveModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Отмена</button>
                            <button
                                onClick={handleBulkMove}
                                disabled={!moveTargetId}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Переместить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move Theme Modal */}
            {isMoveThemeModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-full m-4">
                        <h3 className="text-xl font-bold mb-4">Переместить тему в...</h3>
                        <ThemeSelectorTree
                            themes={themes}
                            mode="folder-select"
                            selectedFolderId={moveThemeTargetId === 'root' ? null : moveThemeTargetId}
                            onSelectFolder={(id) => setMoveThemeTargetId(id || 'root')}
                            excludeId={selectedThemeId}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setIsMoveThemeModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Отмена</button>
                            <button
                                onClick={handleMoveTheme}
                                disabled={!moveThemeTargetId}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Переместить
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={!!confirmDeleteThemeId}
                title="Удаление темы"
                message="Вы уверены, что хотите удалить эту тему? Это действие нельзя отменить."
                onConfirm={performDeleteTheme}
                onCancel={() => setConfirmDeleteThemeId(null)}
            />
        </div>
    );
}

// Tree Component
interface ThemeTreeProps {
    themes: ThemeMeta[];
    parentId: string | undefined;
    selectedId: string | null;
    expandedIds: Set<string>;
    onSelect: (t: ThemeMeta) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    toggleExpand: (id: string) => void;
    level?: number;
}

function ThemeTree({ themes, parentId, selectedId, expandedIds, onSelect, onDelete, toggleExpand, level = 0 }: ThemeTreeProps) {
    // Filter items for this level
    const items = themes.filter(t => t.parentId === parentId || (parentId === undefined && !t.parentId))
        .sort((a, b) => {
            // Groups first, then names
            if (a.isGroup && !b.isGroup) return -1;
            if (!a.isGroup && b.isGroup) return 1;
            return a.name.localeCompare(b.name);
        });

    if (items.length === 0) return null;

    return (
        <div style={{ marginLeft: level * 12 }}>
            {items.map(t => {
                const isExpanded = expandedIds.has(t.id);
                // Check if has children (maybe use for logic later, for now unused)


                return (
                    <div key={t.id}>
                        <div
                            onClick={() => {
                                if (t.isGroup) toggleExpand(t.id); // Click group to toggle
                                onSelect(t); // Also select to set context? 
                            }}
                            className={`flex items-center p-2 rounded-lg cursor-pointer text-sm mb-1 transition-colors ${selectedId === t.id
                                ? 'bg-blue-100 text-blue-900 ring-1 ring-blue-300'
                                : 'hover:bg-slate-100 text-slate-700'
                                }`}
                        >
                            {/* Icon */}
                            <div className="mr-2 text-slate-400">
                                {t.isGroup ? (
                                    <span onClick={(e) => { e.stopPropagation(); toggleExpand(t.id); }}>
                                        {isExpanded ? '📂' : '📁'}
                                    </span>
                                ) : (
                                    '📄'
                                )}
                            </div>

                            {/* Name */}
                            <div className="flex-1 truncate font-medium">
                                {t.name}
                            </div>

                            {/* Count */}
                            <div className="text-xs text-slate-400 mr-2">
                                {t.wordCount !== undefined ? t.wordCount : ''}
                            </div>

                            {/* Delete Action (Only custom) */}
                            {t.path.startsWith('local://') || t.isGroup ? (
                                <button
                                    onClick={(e) => onDelete(e, t.id)}
                                    className="opacity-0 hover:opacity-100 p-1 text-slate-400 hover:text-red-600"
                                >
                                    ×
                                </button>
                            ) : null}
                        </div>

                        {/* Recursion */}
                        {t.isGroup && isExpanded && (
                            <ThemeTree
                                themes={themes}
                                parentId={t.id}
                                selectedId={selectedId}
                                expandedIds={expandedIds}
                                onSelect={onSelect}
                                onDelete={onDelete}
                                toggleExpand={toggleExpand}
                                level={level + 1}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
