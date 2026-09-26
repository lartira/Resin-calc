import React, { useState, useEffect, useRef } from 'react';
import { Calculator as CalculatorIcon, History as HistoryIcon, Settings as SettingsIcon, Palette, Layers, Pencil, X } from 'lucide-react';
import Calculator from './components/Calculator';
import History from './components/History';
import Settings from './components/Settings';
import ColorGallery from './components/ColorGallery';
import MaterialGallery from './components/MaterialGallery';
import ErrorBoundary from './components/ErrorBoundary'; // Safety net
import UpdateNotifier from './components/UpdateNotifier';
import { dataHandler } from './utils/dataHandler';
import { translations } from './utils/translations';

import { useDebounce } from './utils/useDebounce';
import { getSystemLanguage } from './utils/systemLanguage';

function App() {
    const [activeTab, setActiveTab] = useState('calculator');
    const [loading, setLoading] = useState(true);

    // Initial state uses system language
    const [settings, setSettings] = useState({
        price1to1: 125.0, price2to1: 125.0, hourlyRate: 150.0, buffer: 15.0,
        moldWear: 10.0, vacuumCost: 5.0, consumables: 5.0,
        multiCastCost: 0.0, // New setting
        language: getSystemLanguage(),
        currency: 'kr',
        invoiceYear: new Date().getFullYear(),
        invoiceSeq: 1,
        syncInterval: 10
    });
    const [entries, setEntries] = useState([]);
    const [colors, setColors] = useState([]);
    const [materials, setMaterials] = useState([]);
    const [customers, setCustomers] = useState([]); // Customer Directory
    const [materialCategories, setMaterialCategories] = useState([]); // Loaded from DB
    const [colorCategories, setColorCategories] = useState([]); // Loaded from DB

    // Persistent Calculator State
    const [calculatorInputs, setCalculatorInputs] = useState({
        projectName: '',
        amount1to1: 0,
        amount2to1: 0,
        useMultiCast: false, // New input
        multiCastCount: 0,   // New input
        customMaterials: [],
        projectNote: '',
        showProjectNoteOnInvoice: false,
        isProjectNoteOpen: false,
        time: 0,
        extrasCost: 0,
        packagingCost: 0,
        useDrift: true,      // New input check
        useVacuum: true,
        includeLabor: true,
        includeProfit: true,
        includeBuffer: true,
        includeMoldWear: true,
        note: '',
        projectImage: null,
        rounding: ''
    });
    const [editingId, setEditingId] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState(Date.now());
    const [isClosing, setIsClosing] = useState(false);

    // Load data on mount
    useEffect(() => {
        const init = async () => {
            try {
                // Parallel load: Main Data + Session Data
                const [data, sessionData] = await Promise.all([
                    dataHandler.loadData(),
                    dataHandler.getSession()
                ]);

                if (data) {
                    setSettings(prev => ({ ...prev, ...(data.settings || {}) }));
                    setEntries(data.entries || []);
                    setColors(data.colors || []);
                    setMaterials(data.materials || []);
                    setCustomers(data.customers || []);
                    if (data.materialCategories) {
                        setMaterialCategories(data.materialCategories);
                    }
                    if (data.colorCategories) {
                        setColorCategories(data.colorCategories);
                    }

                    // Priority: Session > Main Data (Migration) > Default
                    if (sessionData) {
                        setCalculatorInputs(prev => ({ ...prev, ...sessionData }));
                    } else if (data.calculatorInputs) {
                        setCalculatorInputs(prev => ({ ...prev, ...data.calculatorInputs }));
                    }
                }
            } catch (err) {
                console.error("Failed to load data", err);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    // Apply theme
    useEffect(() => {
        const theme = settings.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.className = theme; // Also set as class for redundancy
    }, [settings.theme]);

    // Ref to hold latest data for Sync (prevents timer reset)
    // NOTE: We still use the Ref mechanism for SYNC interval access, but for AUTO-SAVE we use debounce directly.
    const latestDataRef = useRef({ settings, entries, colors, materials, customers, materialCategories, colorCategories, calculatorInputs });

    useEffect(() => {
        latestDataRef.current = { settings, entries, colors, materials, customers, materialCategories, colorCategories, calculatorInputs };
    }, [settings, entries, colors, materials, customers, materialCategories, colorCategories, calculatorInputs]);

    // Prepare heavy data for auto-save (Settings, Entries, etc.)
    // EXCLUDING calculatorInputs to prevent lag
    // Memoize to prevent re-save when calculator inputs change (which triggers re-render)
    const mainDataToSave = React.useMemo(() => ({
        settings, entries, colors, materials, customers, materialCategories, colorCategories
    }), [settings, entries, colors, materials, customers, materialCategories, colorCategories]);

    // Debounce Main Data (Heavy) - 2000ms (Relaxed since deletions save explicitly)
    const debouncedMainData = useDebounce(mainDataToSave, 2000);

    // Close Confirmation & Force Save Logic
    useEffect(() => {
        if (window.electronAPI) {
            // Return the unsubscribe so only the handler with the latest data stays registered
            return window.electronAPI.onCloseIntent(async () => {
                setIsClosing(true);
                // Small delay to allow React to render the overlay before IPC blocks
                await new Promise(resolve => setTimeout(resolve, 50));

                try {
                    // Force save everything (including inputs if needed) to ensure latest state
                    await window.electronAPI.saveData(mainDataToSave);

                    const sessionToSave = {
                        calculatorInputs,
                        lastActiveTab: activeTab
                    };
                    await window.electronAPI.saveSession(sessionToSave);
                } catch (e) {
                    console.error("Failed to save on close:", e);
                } finally {
                    // Always confirm close even if save failed (don't trap user)
                    window.electronAPI.confirmClose();
                }
            });
        }
    }, [mainDataToSave, calculatorInputs, activeTab]);

    // Debounce Session Data (Light) - 500ms (Fast interactions)
    const debouncedSession = useDebounce(calculatorInputs, 500);

    // Effect 1: Auto-Save Main Data (Heavy)
    useEffect(() => {
        if (!loading && debouncedMainData) {
            if (settings.enableBufferedSave) {
                dataHandler.saveLocalBuffer(debouncedMainData).catch(err => console.error("Buffer save failed", err));
            } else {
                dataHandler.saveData(debouncedMainData);
            }
        }
    }, [debouncedMainData, loading, settings.enableBufferedSave]);

    // Effect 2: Auto-Save Session Data (Light)
    useEffect(() => {
        if (!loading && debouncedSession) {
            dataHandler.saveSession(debouncedSession);
        }
    }, [debouncedSession, loading]);

    // Sync Loop (only active if Buffered Save is enabled)
    useEffect(() => {
        if (!settings.enableBufferedSave || loading) return;

        // Convert Minutes to Milliseconds (Default 10 min if not set)
        const minutes = Math.max(1, parseInt(settings.syncInterval || 10));
        const intervalMs = minutes * 60 * 1000;

        const syncId = setInterval(async () => {
            setIsSyncing(true);
            try {
                // Read from Ref to get latest data without resetting timer
                const fullData = latestDataRef.current;

                // Exclude calculatorInputs from Sync (Local only)
                const { calculatorInputs, ...dataToSync } = fullData;

                await dataHandler.syncData(dataToSync);
                setLastSyncTime(Date.now());
            } catch (err) {
                console.error("Sync failed", err);
            } finally {
                // Keep "Syncing" shown for at least 500ms so user sees it
                setTimeout(() => setIsSyncing(false), 800);
            }
        }, intervalMs);

        return () => clearInterval(syncId);
    }, [settings.enableBufferedSave, settings.syncInterval, loading]);

    // Translation Helper
    const t = (key, fallback) => {
        const lang = settings.language || 'da';
        const dict = translations[lang] || translations['en'];
        return dict?.[key] || fallback || key;
    };

    const handleSaveEntry = (entryData) => {
        if (editingId) {
            // Update existing
            setEntries(prev => prev.map(e => e.id === editingId ? { ...e, ...entryData, id: editingId, date: e.date } : e));
            // We do NOT clear inputs here, so user can continue editing or see what they saved.
            // But we should probably exit edit mode? 
            // Let's clear edit mode but keep inputs for now, or clear everything. 
            // User request: "husker hvad der er skrevet". So let's keep it.
            // Actually, for a NEW save, we usually clear. But for edit...
            // Let's stick to standard behavior: Save = Done. 
            // But for "persistence", we keep inputs if they switch tabs. 
            // If they SAVE, it's a "submit", so we usually clear.
            setEditingId(null);
            setCalculatorInputs({
                projectName: '',
                amount1to1: 0,
                amount2to1: 0,
                customMaterials: [],
                time: 0,
                extrasCost: 0,
                packagingCost: 0,
                useDrift: true,
                useVacuum: true,
                includeLabor: true,
                includeProfit: true,
                includeBuffer: true,
                includeMoldWear: true,
                note: '',
                projectImage: null
            });
        } else {
            // Create new
            setEntries(prev => [entryData, ...prev]);
            // Clear inputs after save new
            setCalculatorInputs({
                projectName: '',
                amount1to1: 0,
                amount2to1: 0,
                customMaterials: [],
                time: 0,
                extrasCost: 0,
                packagingCost: 0,
                useVacuum: true,
                includeLabor: true,
                includeProfit: true,
                includeBuffer: true,
                includeMoldWear: true,
                note: '',
                projectImage: null
            });
        }
        setActiveTab('history');
    };

    // Unified Handler: Save Local + Force Sync
    const handleSaveAndSync = (entry) => {
        handleSaveEntry(entry);
        forceSync();
    };

    const handleEditEntry = (entry) => {
        setCalculatorInputs({
            projectName: entry.projectName,
            amount1to1: entry.amount1to1 || 0,
            amount2to1: entry.amount2to1 || 0,
            useMultiCast: entry.useMultiCast || false,
            multiCastCount: entry.multiCastCount || 0,
            customMaterials: entry.customMaterials || [],
            projectNote: entry.projectNote || '',
            showProjectNoteOnInvoice: entry.showProjectNoteOnInvoice || false,
            isProjectNoteOpen: !!entry.projectNote, // Auto-open if there is a note
            time: entry.time || 0,
            extrasCost: entry.extrasCost || 0,
            packagingCost: entry.packagingCost || 0,
            useDrift: entry.useDrift !== undefined ? entry.useDrift : true,
            useVacuum: entry.useVacuum !== undefined ? entry.useVacuum : true,
            includeLabor: entry.includeLabor !== undefined ? entry.includeLabor : true,
            includeProfit: entry.includeProfit !== undefined ? entry.includeProfit : true,
            includeBuffer: entry.includeBuffer !== undefined ? entry.includeBuffer : true,
            includeMoldWear: entry.includeMoldWear !== undefined ? entry.includeMoldWear : true,
            note: entry.note || '',
            projectImage: entry.projectImage || null,
            rounding: entry.rounding || ''
        });
        setEditingId(entry.id);
        setActiveTab('calculator');
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setCalculatorInputs({
            projectName: '',
            amount1to1: 0,
            amount2to1: 0,
            useMultiCast: false,
            multiCastCount: 0,
            customMaterials: [],
            time: 0,
            extrasCost: 0,
            packagingCost: 0,
            useDrift: true,
            useVacuum: true,
            includeLabor: true,
            includeProfit: true,
            includeBuffer: true,
            includeMoldWear: true,
            note: '',
            projectImage: null,
            rounding: ''
        });
    };

    const handleDeleteEntry = (id) => {
        if (confirm(t('confirmDelete'))) {
            setEntries(prev => prev.filter(e => e.id !== id));
        }
    };

    const handleUpdateEntry = (id, updatedFields) => {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updatedFields } : e));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-skin-base flex items-center justify-center text-skin-base-text">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p>Loading configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-skin-base text-skin-base-text selection:bg-primary selection:text-white transition-colors duration-300">
            {/* Top Navigation Bar */}
            <nav className="border-b border-skin-border bg-skin-card sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-primary to-blue-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Layers className="text-white" size={24} />
                        </div>
                        <div>
                            <h1 className="font-bold text-xl tracking-tight leading-none text-skin-base-text">EpoxyCalc</h1>
                            <p className="text-xs text-skin-muted font-medium ml-0.5">Professional Tool</p>
                        </div>
                    </div>

                    {/* Sync Status Badge */}
                    {settings.enableBufferedSave && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isSyncing
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                            : 'bg-green-500/10 text-green-500 border border-green-500/20'
                            }`}>
                            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
                            {isSyncing ? 'Syncing...' : 'Synced'}
                        </div>
                    )}

                    <div className="flex bg-skin-base p-1 rounded-lg border border-skin-border">
                        <button
                            onClick={() => setActiveTab('calculator')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'calculator'
                                ? 'bg-skin-card text-primary shadow-sm ring-1 ring-black/5'
                                : 'text-skin-muted hover:text-skin-base-text hover:bg-skin-accent'
                                }`}
                        >
                            <CalculatorIcon size={18} />
                            <span className="hidden sm:inline">{t('tabCalculator')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'history'
                                ? 'bg-skin-card text-primary shadow-sm ring-1 ring-black/5'
                                : 'text-skin-muted hover:text-skin-base-text hover:bg-skin-accent'
                                }`}
                        >
                            <HistoryIcon size={18} />
                            <span className="hidden sm:inline">{t('tabHistory')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('materials')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'materials'
                                ? 'bg-skin-card text-primary shadow-sm ring-1 ring-black/5'
                                : 'text-skin-muted hover:text-skin-base-text hover:bg-skin-accent'
                                }`}
                        >
                            <Layers size={18} />
                            <span className="hidden sm:inline">{t('tabMaterials')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('colors')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'colors'
                                ? 'bg-skin-card text-primary shadow-sm ring-1 ring-black/5'
                                : 'text-skin-muted hover:text-skin-base-text hover:bg-skin-accent'
                                }`}
                        >
                            <Palette size={18} />
                            <span className="hidden sm:inline">{t('tabColors')}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`flex items-center gap-2 px-4 p-2 rounded-md text-sm font-medium transition-all ${activeTab === 'settings'
                                ? 'bg-skin-card text-primary shadow-sm ring-1 ring-black/5'
                                : 'text-skin-muted hover:text-skin-base-text hover:bg-skin-accent'
                                }`}
                        >
                            <SettingsIcon size={18} />
                            <span className="hidden sm:inline">{t('tabSettings')}</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {activeTab === 'calculator' && (
                    <ErrorBoundary>
                        <Calculator
                            settings={settings}
                            onSave={handleSaveAndSync}
                            t={t}
                            inputs={calculatorInputs}
                            setInputs={setCalculatorInputs}
                            isEditing={!!editingId}
                            onCancel={handleCancelEdit}
                            colors={colors}
                            materials={materials}
                        />
                    </ErrorBoundary>
                )}
                {activeTab === 'history' && (
                    <ErrorBoundary>
                        <History
                            entries={entries}
                            settings={settings}
                            setSettings={setSettings}
                            onDelete={handleDeleteEntry}
                            onEdit={handleEditEntry}
                            t={t}
                            customers={customers}
                        />
                    </ErrorBoundary>
                )}
                {activeTab === 'colors' && (
                    <ErrorBoundary>
                        <ColorGallery colors={colors} categories={colorCategories} t={t} currency={settings.currency || 'kr'} />
                    </ErrorBoundary>
                )}
                {activeTab === 'materials' && (
                    <ErrorBoundary>
                        <MaterialGallery materials={materials} categories={materialCategories} t={t} currency={settings.currency || 'kr'} />
                    </ErrorBoundary>
                )}
                {activeTab === 'settings' && (
                    <ErrorBoundary>
                        <Settings
                            settings={settings}
                            setSettings={setSettings}
                            t={t}
                            colors={colors}
                            setColors={setColors}
                            materials={materials}
                            setMaterials={setMaterials}
                            materialCategories={materialCategories}
                            setMaterialCategories={setMaterialCategories}
                            colorCategories={colorCategories}
                            setColorCategories={setColorCategories}
                            customers={customers} // Pass customers
                            setCustomers={setCustomers} // Pass setter
                            entries={entries} // Pass entries for backup
                            inputs={calculatorInputs} // Pass inputs for backup
                        />
                    </ErrorBoundary>
                )}
            </main>
            {/* SYNC INDICATOR */}
            {isSyncing && (
                <div className="fixed bottom-4 right-4 bg-skin-card border border-primary text-primary px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium z-50 animate-bounce-slight opacity-90">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    Syncing...
                </div>
            )}

            <UpdateNotifier />

            {/* CLOSE SAVING OVERLAY */}
            {isClosing && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center flex-col gap-4 text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
                    <h2 className="text-xl font-bold">Gemmer data...</h2>
                    <p className="text-sm opacity-80">Lukker programmet om et øjeblik</p>
                </div>
            )}
        </div>
    );
}

export default App;
