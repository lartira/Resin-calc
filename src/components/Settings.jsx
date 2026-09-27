import React, { useState } from 'react';
import {
    Save, Plus, Trash2, Download, Upload, Copy, FolderInput,
    HelpCircle, Globe, Palette, Layers, DollarSign, Clock, Beaker,
    FileText, User, Users, MapPin, Phone, Mail, Globe as GlobeIcon, ImageIcon, // Added Users
    Check, X, Pencil, Shield, Zap, ChevronDown, ChevronRight, ChevronUp, ArrowRight, Database, Folder // Added Folder
} from 'lucide-react';



const Settings = ({
    settings, setSettings,
    colors, setColors,
    materials, setMaterials,
    materialCategories, setMaterialCategories,
    colorCategories, setColorCategories,
    customers, setCustomers,
    entries, inputs, // Added for full backup
    t
}) => {
    const [newColor, setNewColor] = useState({ name: '', type: '', image: '', note: '', cost: '' });
    const [editingColorId, setEditingColorId] = useState(null);
    const [newCategory, setNewCategory] = useState('');
    const [newColorCategory, setNewColorCategory] = useState(''); // Separate state for color categories input
    const [newMaterial, setNewMaterial] = useState({ name: '', cost: '', category: '', images: [], note: '' }); // Replaced 'image' with 'images' array
    const [editingMaterialId, setEditingMaterialId] = useState(null);

    // Customer Directory State
    const [newCustomer, setNewCustomer] = useState({ name: '', address: '', zipCity: '', cvr: '', phone: '', email: '', ref: '' });
    const [editingCustId, setEditingCustId] = useState(null);

    const [collapsedSections, setCollapsedSections] = useState({});
    const [currentDataPath, setCurrentDataPath] = useState('');

    React.useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.getDataPath().then(path => setCurrentDataPath(path));
        }
    }, []);

    const toggleSection = (section) => {
        setCollapsedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Special handling for string fields
        const stringFields = [
            'language', 'currency', 'theme',
            'companyName', 'companyAddress', 'companyZipCity',
            'companyCVR', 'companyPhone', 'companyEmail', 'companyWeb'
        ];
        const isString = stringFields.includes(name);
        const val = isString ? value : (parseFloat(value) || 0);

        setSettings(prev => ({
            ...prev,
            [name]: val
        }));
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewColor(prev => ({ ...prev, image: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveColor = () => {
        if (!newColor.name) return;
        const cat = newColor.type || (colorCategories.length > 0 ? colorCategories[0] : '');

        if (editingColorId) {
            setColors(prev => prev.map(c => c.id === editingColorId ? { ...newColor, type: cat, id: editingColorId } : c));
            setEditingColorId(null);
        } else {
            setColors(prev => [...prev, { ...newColor, type: cat, id: crypto.randomUUID() }]);
        }
        setNewColor({ name: '', type: '', image: '', note: '', cost: '' });
    };

    const startEditColor = (color) => {
        setNewColor({ ...color });
        setEditingColorId(color.id);
        // Scroll to form
        document.getElementById('color-form')?.scrollIntoView({ behavior: 'smooth' });
    };

    const cancelEditColor = () => {
        setNewColor({ name: '', type: '', image: '', note: '', cost: '' });
        setEditingColorId(null);
    };

    const deleteColor = (id) => {
        if (confirm(t('confirmDelete'))) {
            setColors(prev => prev.filter(c => c.id !== id));
            if (editingColorId === id) cancelEditColor();
        }
    };

    // --- CATEGORY MANAGEMENT HELPERS ---

    // 1. RENAME CATEGORY
    const handleRenameCategory = (type, oldName, newName) => {
        if (!newName || oldName === newName) return;

        // Prevent duplicate names
        const existing = type === 'color' ? colorCategories : materialCategories;
        if (existing.includes(newName)) {
            alert(t('catExists') || "Category already exists");
            return;
        }

        if (type === 'color') {
            const newCats = colorCategories.map(c => c === oldName ? newName : c);
            setColorCategories(newCats);
            // Cascasde: Update items
            setColors(prev => prev.map(c => c.type === oldName ? { ...c, type: newName } : c));
            forceSave({ colorCategories: newCats, colors: colors.map(c => c.type === oldName ? { ...c, type: newName } : c) });
        } else {
            const newCats = materialCategories.map(c => c === oldName ? newName : c);
            setMaterialCategories(newCats);
            // Cascasde: Update items
            setMaterials(prev => prev.map(m => m.category === oldName ? { ...m, category: newName } : m));
            forceSave({ materialCategories: newCats, materials: materials.map(m => m.category === oldName ? { ...m, category: newName } : m) });
        }
    };

    // 2. REORDER CATEGORY
    const handleReorderCategory = (type, index, direction) => {
        const list = type === 'color' ? [...colorCategories] : [...materialCategories];
        const newIndex = direction === 'up' ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= list.length) return;

        // Swap
        [list[index], list[newIndex]] = [list[newIndex], list[index]];

        if (type === 'color') {
            setColorCategories(list);
            forceSave({ colorCategories: list });
        } else {
            setMaterialCategories(list);
            forceSave({ materialCategories: list });
        }
    };

    // 3. MIGRATE CATEGORY (Cross-Library)
    const handleMigrateCategory = (catName, fromType) => {
        const toType = fromType === 'color' ? 'material' : 'color';
        const msg = `Move category "${catName}" to ${toType === 'color' ? 'Color' : 'Material'} Library? Items will be converted.`;
        if (!confirm(msg)) return;

        // 1. Update Category Arrays
        if (fromType === 'color') {
            // Remove from Colors, Add to Materials
            const newColorCats = colorCategories.filter(c => c !== catName);
            const newMatCats = [...materialCategories, catName]; // Check duplicates?
            if (materialCategories.includes(catName)) {
                // Merge scenario: Just remove from source, items merge into existing dest
            }

            setColorCategories(newColorCats);
            setMaterialCategories(prev => prev.includes(catName) ? prev : [...prev, catName]);

            // 2. Migrate Items
            const itemsToMigrate = colors.filter(c => c.type === catName);
            const remainingColors = colors.filter(c => c.type !== catName);
            const newMaterials = itemsToMigrate.map(c => ({
                id: c.id,
                name: c.name,
                cost: c.cost,
                category: catName, // Map type -> category
                images: c.image ? [c.image] : [], // Map single image -> array
                note: c.note
            }));

            setColors(remainingColors);
            setMaterials(prev => [...prev, ...newMaterials]);

            forceSave({
                colorCategories: newColorCats,
                materialCategories: materialCategories.includes(catName) ? materialCategories : [...materialCategories, catName],
                colors: remainingColors,
                materials: [...materials, ...newMaterials]
            });

        } else {
            // Remove from Materials, Add to Colors
            const newMatCats = materialCategories.filter(c => c !== catName);
            const newColorCats = [...colorCategories, catName];

            setMaterialCategories(newMatCats);
            setColorCategories(prev => prev.includes(catName) ? prev : [...prev, catName]);

            // 2. Migrate Items
            const itemsToMigrate = materials.filter(m => m.category === catName);
            const remainingMaterials = materials.filter(m => m.category !== catName);
            const newColors = itemsToMigrate.map(m => ({
                id: m.id,
                name: m.name,
                cost: m.cost,
                type: catName, // Map category -> type
                image: (m.images && m.images[0]) || m.image || null, // Map array -> single
                note: m.note
            }));

            setMaterials(remainingMaterials);
            setColors(prev => [...prev, ...newColors]);

            forceSave({
                materialCategories: newMatCats,
                colorCategories: colorCategories.includes(catName) ? colorCategories : [...colorCategories, catName],
                materials: remainingMaterials,
                colors: [...colors, ...newColors]
            });
        }
    };

    // Helper for Force Save (consolidated)
    const forceSave = (partialData) => {
        if (window.electronAPI) {
            const dataToSave = {
                settings,
                // entries: entries || [], // OPTIMIZATION: Main process merges. Don't send heavy entries.
                colors: colors || [],
                materials: materials || [],
                customers: customers || [],
                materialCategories: materialCategories || [],
                colorCategories: colorCategories || [],
                ...partialData // Overwrite with updates
            };
            window.electronAPI.saveData(dataToSave).catch(err => console.error("Force save failed:", err));
        }
    };

    const addColorCategory = () => {
        if (!newColorCategory || colorCategories.includes(newColorCategory)) return;
        const newCats = [...colorCategories, newColorCategory];
        setColorCategories(newCats);
        forceSave({ colorCategories: newCats });
        setNewColorCategory('');
    };

    const deleteColorCategory = async (cat) => {
        const msg = (t('confirmDeleteCat') || "Delete category \"{0}\"?").replace('{0}', cat);
        if (confirm(msg)) {
            const newCategories = colorCategories.filter(c => c !== cat);
            setColorCategories(newCategories);
            forceSave({ colorCategories: newCategories });
        }
    };

    // --- MATERIALS LOGIC ---
    const addCategory = () => {
        if (!newCategory || materialCategories.includes(newCategory)) return;
        const newCats = [...materialCategories, newCategory];
        setMaterialCategories(newCats);
        forceSave({ materialCategories: newCats });
        setNewCategory('');
    };

    const deleteCategory = (cat) => {
        const msg = (t('confirmDeleteMatCat') || "Delete category \"{0}\"?").replace('{0}', cat);
        if (confirm(msg)) {
            const newCats = materialCategories.filter(c => c !== cat);
            setMaterialCategories(newCats);
            forceSave({ materialCategories: newCats });
        }
    };

    const handleMatImageUpload = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewMaterial(prev => ({
                    ...prev,
                    images: [...(prev.images || []), reader.result]
                }));
            };
            reader.readAsDataURL(file);
        });
    };

    const removeNewMatImage = (index) => {
        setNewMaterial(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const handleSaveMaterial = () => {
        if (!newMaterial.name) return;

        // Default to first category if none selected
        const cat = newMaterial.category || (materialCategories.length > 0 ? materialCategories[0] : '');
        const matToSave = {
            ...newMaterial,
            category: cat,
            // Ensure backwards compatibility or migration if needed, but we rely on 'images' now
            image: newMaterial.images.length > 0 ? newMaterial.images[0] : ''
        };

        if (editingMaterialId) {
            setMaterials(prev => prev.map(m => m.id === editingMaterialId ? { ...matToSave, id: editingMaterialId } : m));
            setEditingMaterialId(null);
        } else {
            setMaterials(prev => [...prev, { ...matToSave, id: crypto.randomUUID() }]);
        }

        setNewMaterial({ name: '', cost: '', category: '', images: [], note: '' });
    };

    const startEditMaterial = (mat) => {
        setNewMaterial({
            name: mat.name,
            cost: mat.cost,
            category: mat.category,
            note: mat.note || '',
            images: mat.images || (mat.image ? [mat.image] : [])
        });
        setEditingMaterialId(mat.id);
        // Scroll to form
        document.getElementById('material-form')?.scrollIntoView({ behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setNewMaterial({ name: '', cost: '', category: '', images: [], note: '' });
        setEditingMaterialId(null);
    };

    const handleDeleteMaterial = (id) => {
        if (confirm(t('confirmDelete'))) {
            setMaterials(prev => prev.filter(m => m.id !== id));
            if (editingMaterialId === id) cancelEdit();
        }
    };

    // --- CUSTOMER LOGIC ---
    const handleSaveCustomer = () => {
        if (!newCustomer.name) return;

        if (editingCustId) {
            setCustomers(prev => prev.map(c => c.id === editingCustId ? { ...newCustomer, id: editingCustId } : c));
            setEditingCustId(null);
        } else {
            setCustomers(prev => [...prev, { ...newCustomer, id: crypto.randomUUID() }]);
        }
        setNewCustomer({ name: '', address: '', zipCity: '', cvr: '', phone: '', email: '', ref: '' });
    };

    const handleDeleteCustomer = (id) => {
        if (confirm("Delete Customer?")) {
            setCustomers(prev => prev.filter(c => c.id !== id));
        }
    };

    const handleEditCustomer = (cust) => {
        setNewCustomer(cust);
        setEditingCustId(cust.id);
        // Maybe scroll to form?
    };



    // Optimization: Pre-calculate groups to avoid O(N*M) filtering during render
    const groupedColors = React.useMemo(() => {
        const groups = {};
        const catSet = new Set(colorCategories);
        colorCategories.forEach(c => groups[c] = []);
        colors.forEach(c => {
            if (catSet.has(c.type)) {
                groups[c.type].push(c);
            }
        });
        return { groups };
    }, [colors, colorCategories]);

    const groupedMaterials = React.useMemo(() => {
        const groups = {};
        const catSet = new Set(materialCategories);
        materialCategories.forEach(c => groups[c] = []);
        materials.forEach(m => {
            if (catSet.has(m.category)) {
                groups[m.category].push(m);
            }
        });
        return { groups };
    }, [materials, materialCategories]);

    const currency = settings.currency || 'kr';

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8">

            {/* DATA MANAGEMENT */}
            <section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database className="text-indigo-600" /> {t('dataManagement')}
                </h2>
                <div className="flex flex-col sm:flex-row gap-4">
                    <button
                        onClick={async () => {
                            if (!window.electronAPI) return alert(t('msgOnlyApp'));

                            // Construct full data from memory to ensure it's up-to-date (bypassing debounce delay)
                            const dataToExport = {
                                settings,
                                entries: entries || [],
                                colors: colors || [],
                                materials: materials || [],
                                customers: customers || [],
                                materialCategories: materialCategories || [],
                                colorCategories: colorCategories || [],
                                calculatorInputs: inputs || {}
                            };

                            const res = await window.electronAPI.exportBackup({
                                title: t('btnExportDB'),
                                data: dataToExport
                            });
                            if (res.success) {
                                alert(`${t('msgBackupSaved')} ${res.filePath}`);
                            } else if (res.error) {
                                alert(`${t('msgExportError')} ${res.error}`);
                            }
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded flex items-center justify-center gap-2 font-medium"
                    >
                        <Download size={20} />
                        {t('btnExportDB')}
                    </button>
                    <button
                        onClick={async () => {
                            if (!window.electronAPI) return alert(t('msgOnlyApp'));
                            if (!confirm(t('msgConfirmImport'))) return;

                            const res = await window.electronAPI.importBackup({
                                title: t('btnImportDB')
                            });
                            if (res.success) {
                                alert(t('msgImportSuccess'));
                                window.location.reload();
                            } else if (res.error) {
                                alert(`${t('msgImportError')} ${res.error}`);
                            }
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded flex items-center justify-center gap-2 font-medium"
                    >
                        <Upload size={20} />
                        {t('btnImportDB')}
                    </button>
                </div>

            </section>

            {/* STORAGE & SYNC SETTINGS */}
            <section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Database className="text-primary" /> {t('setStorageTitle') || 'Lagring og Synkronisering'}
                </h2>

                {/* Location */}
                <div className="pt-2">
                    <label className="block text-sm font-medium text-skin-muted mb-2">{t('lblDbLoc')}</label>
                    <div className="flex flex-col md:flex-row gap-3 items-center">
                        <div className="flex-1 bg-skin-base border border-skin-border rounded p-2 text-sm text-skin-muted font-mono w-full truncate">
                            {currentDataPath || 'Loading...'}
                        </div>
                        <button
                            onClick={async () => {
                                if (!window.electronAPI) return alert(t('msgOnlyApp'));
                                const res = await window.electronAPI.changeDataPath({
                                    title: t('dialogSelectFolder'),
                                    dialogNewLoc: t('dialogNewLoc'),
                                    dialogNoDbFound: t('dialogNoDbFound'),
                                    dialogCopyAsk: t('dialogCopyAsk'),
                                    buttons: [t('btnCopyData'), t('btnStartFresh'), t('btnCancel')]
                                });
                                if (res.success) {
                                    alert(t('msgLocChanged'));
                                    window.location.reload();
                                } else if (res.error) {
                                    alert(`${t('msgLocError')} ${res.error}`);
                                }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm whitespace-nowrap"
                        >
                            <Folder size={16} /> {t('btnChangeLoc')}
                        </button>
                    </div>
                    <p className="text-xs text-skin-muted mt-2">
                        {t('tipShared')}
                    </p>
                </div>

                {/* Buffered Save Options */}
                <div className="mt-6 pt-4 border-t border-skin-border">
                    <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableBufferedSave"
                                checked={settings.enableBufferedSave || false}
                                onChange={(e) => setSettings(prev => ({ ...prev, enableBufferedSave: e.target.checked }))}
                                className="rounded border-skin-border text-primary focus:ring-primary h-4 w-4"
                            />
                            <span className="text-sm font-medium text-skin-base-text">{t('enableBufferedSave') || 'Aktiver "Smart Auto-save" (Buffer)'}</span>
                        </label>
                    </div>
                    <p className="text-xs text-skin-muted mb-4">
                        {t('descBufferedSave') || 'Gemmer lokalt først og synkroniserer til netværksdrevet i baggrunden. Anbefales til delte mapper.'}
                    </p>

                    {settings.enableBufferedSave && (
                        <div>
                            <label className="block text-sm font-medium text-skin-muted mb-1">{t('syncInterval') || 'Synkroniserings-interval (minutter)'}</label>
                            <input
                                type="number"
                                name="syncInterval"
                                value={settings.syncInterval || 10}
                                onChange={handleChange}
                                min="1"
                                max="3600"
                                className="w-24 rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            />
                        </div>
                    )}
                </div>

                {/* Force Sync Button */}
                <div className="mt-6 pt-6 border-t border-skin-border">
                    <button
                        onClick={async () => {
                            if (!window.electronAPI) return;
                            if (!confirm(t('confirmForceSync', "Vil du tvinge en gemning af data til netværksdrevet? Fortsæt?"))) return;

                            try {
                                const dataToSave = {
                                    settings,
                                    colors: colors || [],
                                    materials: materials || [],
                                    customers: customers || [],
                                    materialCategories: materialCategories || [],
                                    colorCategories: colorCategories || []
                                };
                                if (entries) dataToSave.entries = entries;

                                await window.electronAPI.saveData(dataToSave);
                                alert(t('msgSyncSuccess', "Databasen blev opdateret med succes!"));
                            } catch (e) {
                                alert(t('msgSyncError', "Fejl under synkronisering: ") + e.message);
                            }
                        }}
                        className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all font-semibold active:transform active:scale-95"
                    >
                        <Zap size={18} />
                        {t('btnForceSync', "Tving Synkronisering")}
                    </button>
                    <p className="text-xs text-skin-muted mt-2 text-center opacity-75">
                        {t('descForceSync', "Brug kun dette hvis du mistænker at netværksfilen ikke er opdateret.")}
                    </p>
                </div>

                {/* Import/Export Buttons moved here or kept above? The original code had Import above. Let's keep existing Import logic but maybe consolidate if needed. For now just keeping the new section clean. */}


            </section >

            {/* COMPANY PROFILE */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    {t('setProfileTitle')}
                </h2>
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="space-y-4 flex-1">
                        <div>
                            <label className="block text-sm font-medium text-skin-muted">{t('setCompanyName')}</label>
                            <input
                                type="text"
                                name="companyName"
                                value={settings.companyName || ''}
                                onChange={handleChange}
                                className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                                placeholder="My Epoxy Co."
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-skin-muted">{t('setCompanyAddress')}</label>
                                <input type="text" name="companyAddress" value={settings.companyAddress || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-base-text" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-skin-muted">{t('setCompanyZipCity')}</label>
                                <input type="text" name="companyZipCity" value={settings.companyZipCity || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-base-text" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-skin-muted">{t('setCompanyCVR')}</label>
                                <input type="text" name="companyCVR" value={settings.companyCVR || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-base-text" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-skin-muted">{t('setCompanyPhone')}</label>
                                <input type="text" name="companyPhone" value={settings.companyPhone || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-base-text" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-skin-muted">{t('setCompanyEmail')}</label>
                                <input type="text" name="companyEmail" value={settings.companyEmail || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-base-text" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-skin-muted">{t('setCompanyWeb')}</label>
                                <input type="text" name="companyWeb" value={settings.companyWeb || ''} onChange={handleChange} className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-base-text" />
                            </div>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-skin-muted">{t('setCompanyLogo')}</label>
                        <div className="flex items-center gap-4 mt-1">
                            {settings.companyLogo ? (
                                <div className="relative group w-20 h-20 border rounded overflow-hidden">
                                    <img src={settings.companyLogo} alt="Logo" className="w-full h-full object-contain" />
                                    <button
                                        onClick={() => setSettings(prev => ({ ...prev, companyLogo: '' }))}
                                        className="absolute top-0 right-0 bg-red-500 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-20 h-20 border-2 border-dashed border-skin-border rounded flex items-center justify-center text-skin-muted">
                                    <ImageIcon />
                                </div>
                            )}
                            <label className="cursor-pointer bg-skin-card border border-skin-border hover:bg-skin-base py-2 px-3 rounded flex items-center gap-2 text-sm text-skin-base-text h-10 self-center">
                                {t('btnUpload')}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setSettings(prev => ({ ...prev, companyLogo: reader.result }));
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </section >

            {/* Invoice Settings */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <FileText className="text-primary" /> {t('setInvoiceTitle')}
                </h2>
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-skin-muted">{t('lblInvoiceYear')}</label>
                        <input
                            type="text"
                            value={settings.invoiceYear || new Date().getFullYear()}
                            disabled
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm p-2 border bg-skin-input text-skin-muted cursor-not-allowed"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-skin-muted">{t('lblInvoiceSeq')}</label>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-skin-muted font-mono">{settings.invoiceYear}-</span>
                            <input
                                type="number"
                                name="invoiceSeq"
                                value={settings.invoiceSeq || 1}
                                onChange={handleChange}
                                min="1"
                                className="block w-full flex-1 rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text font-mono"
                            />
                        </div>
                        <p className="text-xs text-skin-muted mt-1">{t('tipInvoiceSeq')}</p>
                    </div>
                </div>
            </section >

            {/* General Settings */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4">{t('setGlobalTitle')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('langLabel')}</label>
                        <select
                            name="language"
                            value={settings.language}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        >
                            <option value="da">Dansk</option>
                            <option value="en">English</option>
                            <option value="sv">Svenska</option>
                            <option value="no">Norsk</option>
                            <option value="de">Deutsch</option>
                            <option value="pl">Polski</option>
                            <option value="cs">Čeština</option>
                            <option value="hu">Magyar</option>
                            <option value="ro">Română</option>
                            <option value="bg">Български</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('currLabel')}</label>
                        <select
                            name="currency"
                            value={settings.currency}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        >
                            <option value="kr">DKK / NOK / SEK (kr)</option>
                            <option value="€">Euro (€)</option>
                            <option value="$">USD ($)</option>
                            <option value="£">GBP (£)</option>
                            <option value="zł">PLN (zł)</option>
                            <option value="Kč">CZK (Kč)</option>
                            <option value="Ft">HUF (Ft)</option>
                            <option value="lei">RON (lei)</option>
                            <option value="лв">BGN (лв)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setTheme')}</label>
                        <select
                            name="theme"
                            value={settings.theme || 'light'}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        >
                            <option value="light">{t('themeLight')}</option>
                            <option value="dark">{t('themeDark')}</option>
                            <option value="ocean">{t('themeOcean')}</option>
                            <option value="sunset">{t('themeSunset')}</option>
                        </select>
                    </div>
                </div>
            </section >

            {/* Prices Settings */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4">{t('setPricesTitle') || "Priser"}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setPrice1')} ({currency}/kg)</label>
                        <input
                            type="number"
                            name="price1to1"
                            value={settings.price1to1}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setPrice2')} ({currency}/kg)</label>
                        <input
                            type="number"
                            name="price2to1"
                            value={settings.price2to1}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setHourly')} ({currency}/t)</label>
                        <input
                            type="number"
                            name="hourlyRate"
                            value={settings.hourlyRate}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setBuffer')}</label>
                        <input
                            type="number"
                            name="buffer"
                            value={settings.buffer}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setMold')} ({currency})</label>
                        <input
                            type="number"
                            name="moldWear"
                            value={settings.moldWear}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted">{t('setVacuum')} ({currency})</label>
                        <input
                            type="number"
                            name="vacuumCost"
                            value={settings.vacuumCost}
                            onChange={handleChange}
                            className="mt-1 block w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted mb-1">{t('setConsumables')} ({settings.currency})</label>
                        <input
                            type="number"
                            name="consumables"
                            value={settings.consumables}
                            onChange={handleChange}
                            className="w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary p-2 bg-skin-input text-skin-base-text"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-skin-muted mb-1">{t('setMultiCast')} ({settings.currency})</label>
                        <input
                            type="number"
                            name="multiCastCost"
                            value={settings.multiCastCost}
                            onChange={handleChange}
                            className="w-full rounded-md border-skin-border shadow-sm focus:border-primary focus:ring-primary p-2 bg-skin-input text-skin-base-text"
                        />
                    </div>
                </div>
            </section >

            {/* CUSTOMER DIRECTORY */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Users className="text-primary" /> {t('setCustTitle')}
                </h2>

                <div className="bg-skin-accent p-4 rounded-lg mb-6">
                    <h3 className="font-semibold text-sm text-primary mb-3">
                        {editingCustId ? 'Rediger Kunde' : t('btnAddCust')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <input
                            type="text"
                            className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('lblCustName')}
                            value={newCustomer.name}
                            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                        />
                        <input
                            type="text"
                            className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('lblCustAddr')}
                            value={newCustomer.address}
                            onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                                placeholder={t('lblCustZipCity')}
                                value={newCustomer.zipCity}
                                onChange={(e) => setNewCustomer({ ...newCustomer, zipCity: e.target.value })}
                            />
                            <input
                                type="text"
                                className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                                placeholder={t('setCompanyCVR')}
                                value={newCustomer.cvr}
                                onChange={(e) => setNewCustomer({ ...newCustomer, cvr: e.target.value })}
                            />
                        </div>
                        <input
                            type="text"
                            className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('setCompanyPhone')}
                            value={newCustomer.phone}
                            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                        />
                        <input
                            type="email"
                            className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('setCompanyEmail')}
                            value={newCustomer.email}
                            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                        />
                        <input
                            type="text"
                            className="rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('lblCustRef')}
                            value={newCustomer.ref}
                            onChange={(e) => setNewCustomer({ ...newCustomer, ref: e.target.value })}
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        {editingCustId && (
                            <button
                                onClick={() => { setEditingCustId(null); setNewCustomer({ name: '', address: '', zipCity: '', cvr: '', phone: '', email: '', ref: '' }); }}
                                className="text-skin-muted text-sm hover:underline"
                            >
                                Annuller
                            </button>
                        )}
                        <button
                            onClick={handleSaveCustomer}
                            className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium"
                        >
                            {editingCustId ? <Check size={16} /> : <Plus size={16} />}
                            {editingCustId ? 'Gem' : t('btnAdd')}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {customers && customers.length > 0 ? (
                        [...customers].sort((a, b) => a.name.localeCompare(b.name)).map(cust => (
                            <div key={cust.id} className="bg-skin-card border border-skin-border p-4 rounded group hover:shadow-md transition-shadow relative">
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-skin-card/80 p-1 rounded">
                                    <button onClick={() => handleEditCustomer(cust)} className="text-primary hover:bg-primary/10 p-1 rounded"><Pencil size={14} /></button>
                                    <button onClick={() => handleDeleteCustomer(cust.id)} className="text-danger hover:bg-danger/10 p-1 rounded"><Trash2 size={14} /></button>
                                </div>
                                <h4 className="font-bold text-skin-base-text mb-1 flex items-center gap-2">
                                    <Users size={14} className="text-skin-muted" /> {cust.name}
                                </h4>
                                <div className="text-xs text-skin-muted space-y-1">
                                    {cust.address && <p>{cust.address}</p>}
                                    {cust.zipCity && <p>{cust.zipCity}</p>}
                                    {cust.email && <p className="truncate">@: {cust.email}</p>}
                                    {cust.phone && <p>📞 {cust.phone}</p>}
                                    {cust.cvr && <p>CVR: {cust.cvr}</p>}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-skin-muted text-sm italic col-span-full text-center py-4">
                            {t('histNoData') || 'Ingen kunder fundet.'}
                        </p>
                    )}
                </div>
            </section >

            {/* COLOR LIBRARY */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4">{t('setColorTitle')}</h2>

                {/* Color Categories Management */}
                <div className="mb-8 bg-skin-accent p-4 rounded-lg">
                    <h3 className="font-semibold text-sm text-primary mb-2">{t('setColorCatTitle')}</h3>
                    <form
                        className="flex gap-2 mb-3"
                        onSubmit={(e) => { e.preventDefault(); addColorCategory(); }}
                    >
                        <input
                            type="text"
                            name="newColorCategory"
                            className="flex-1 rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('phNewCat')}
                            value={newColorCategory}
                            onChange={(e) => setNewColorCategory(e.target.value)}
                            autoComplete="off"
                        />
                        <button type="submit" className="bg-primary text-white px-4 rounded hover:bg-primary-hover">
                            <Plus size={16} />
                        </button>
                    </form>
                    <div className="flex flex-col gap-2">
                        {colorCategories.map((cat, index) => (
                            <div key={cat} className="flex items-center justify-between bg-skin-card p-2 rounded border border-skin-border shadow-sm group">
                                <span className="font-semibold text-sm text-skin-base-text">{cat}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Reorder */}
                                    <button onClick={() => handleReorderCategory('color', index, 'up')} disabled={index === 0} className="p-1 hover:text-primary disabled:opacity-30"><ChevronUp size={14} /></button>
                                    <button onClick={() => handleReorderCategory('color', index, 'down')} disabled={index === colorCategories.length - 1} className="p-1 hover:text-primary disabled:opacity-30"><ChevronDown size={14} /></button>
                                    <div className="w-px h-4 bg-skin-border mx-1"></div>
                                    {/* Actions */}
                                    <button
                                        onClick={() => {
                                            const newName = prompt("Rename category:", cat);
                                            if (newName) handleRenameCategory('color', cat, newName);
                                        }}
                                        className="p-1 text-skin-muted hover:text-primary"
                                        title="Rename"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleMigrateCategory(cat, 'color')}
                                        className="p-1 text-skin-muted hover:text-indigo-500"
                                        title="Move to Material Library"
                                    >
                                        <ArrowRight size={14} />
                                    </button>
                                    <button onClick={() => deleteColorCategory(cat)} className="p-1 text-danger hover:bg-danger/10 rounded"><X size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div id="color-form" className={`flex flex-col gap-4 mb-6 p-4 rounded-lg transition-colors ${editingColorId ? 'bg-skin-accent border border-skin-border' : 'bg-skin-base'}`}>
                    {editingColorId && (
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-primary flex items-center gap-2">
                                <Pencil size={16} /> Rediger farve
                            </h3>
                            <button onClick={cancelEditColor} className="text-sm text-skin-muted hover:text-skin-base-text">Annuller</button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-skin-muted mb-1">{t('setColorName')}</label>
                            <input
                                type="text"
                                value={newColor.name}
                                onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                                className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                                placeholder={t('phMatName')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-skin-muted mb-1">{t('setColorType')}</label>
                            <select
                                value={newColor.type}
                                onChange={(e) => setNewColor({ ...newColor, type: e.target.value })}
                                className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            >
                                <option value="" disabled>{t('lblSelect')}</option>
                                {colorCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-skin-muted mb-1">{t('lblColorCost')} ({settings.currency})</label>
                            <input
                                type="number"
                                value={newColor.cost}
                                onChange={(e) => setNewColor({ ...newColor, cost: e.target.value })}
                                className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="w-full">
                        <label className="block text-xs font-medium text-skin-muted mb-1">{t('setColorNote')}</label>
                        <textarea
                            value={newColor.note}
                            onChange={(e) => setNewColor({ ...newColor, note: e.target.value })}
                            className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder="..."
                            rows="2"
                        />
                    </div>

                    <div className="flex justify-between items-center">
                        <label className="cursor-pointer bg-skin-card border border-skin-border hover:bg-skin-base py-2 px-3 rounded flex items-center gap-2 text-sm text-skin-base-text">
                            <ImageIcon size={16} />
                            {newColor.image ? t('btnChange') : t('btnUpload')}
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        </label>

                        <button
                            onClick={handleSaveColor}
                            className={`bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium`}
                        >
                            {editingColorId ? <Check size={16} /> : <Plus size={16} />}
                            {editingColorId ? 'Gem ændringer' : t('btnAdd')}
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                    {colorCategories.map(cat => {
                        const catColors = groupedColors.groups[cat] || [];
                        if (catColors.length === 0) return null;
                        const isCollapsed = collapsedSections[`color-${cat}`];

                        return (
                            <div key={cat} className="space-y-2">
                                <div
                                    className="flex items-center gap-2 cursor-pointer border-b pb-1 border-skin-border group"
                                    onClick={() => toggleSection(`color-${cat}`)}
                                >
                                    {isCollapsed ? <ChevronRight size={16} className="text-skin-muted group-hover:text-primary" /> : <ChevronDown size={16} className="text-skin-muted group-hover:text-primary" />}
                                    <h4 className="font-semibold text-skin-base-text select-none text-sm">
                                        {cat} ({catColors.length})
                                    </h4>
                                </div>
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 animate-fadeIn">
                                        {catColors.map(color => (
                                            <div key={color.id} className="relative group bg-skin-card border border-skin-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                                <div className="absolute top-1 right-1 flex gap-1  z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => startEditColor(color)}
                                                        className="bg-white/90 hover:bg-white text-indigo-600 p-1 rounded shadow-sm"
                                                        title="Rediger"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteColor(color.id)}
                                                        className="bg-danger hover:bg-red-600 text-white p-1 rounded shadow-sm"
                                                        title="Slet"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                                <div className="h-24 bg-skin-base flex items-center justify-center overflow-hidden">
                                                    {color.image ? (
                                                        <img src={color.image} alt={color.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="text-skin-border"><ImageIcon size={32} /></div>
                                                    )}
                                                </div>
                                                <div className="p-2">
                                                    <p className="font-medium text-sm truncate text-skin-base-text" title={color.name}>{color.name}</p>
                                                    <div className="flex justify-between items-center text-xs text-skin-muted">
                                                        <span className="capitalize">
                                                            {color.type === 'pulver' ? t('typePowder') :
                                                                color.type === 'flydende' ? t('typeLiquid') :
                                                                    color.type === 'alcohol' ? t('typeAlcohol') : color.type}
                                                        </span>
                                                        {color.cost && <span className="font-mono text-primary bg-skin-accent px-1 rounded">{color.cost} {settings.currency}</span>}
                                                    </div>
                                                    {color.note && <p className="text-xs text-skin-muted mt-1 truncate" title={color.note}>📝 {color.note}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* Uncategorized Colors */}
                    {colors.filter(c => !colorCategories.includes(c.type)).length > 0 && (
                        <div className="space-y-2 mt-4">
                            <h4 className="font-semibold text-skin-muted select-none text-sm border-b pb-1 border-skin-border">{t('otherCategory') || 'Andet'}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                {colors.filter(c => !colorCategories.includes(c.type)).map(color => (
                                    <div key={color.id} className="relative group bg-skin-card border border-skin-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                        {/* Same actions for uncategorized */}
                                        <div className="absolute top-1 right-1 flex gap-1  z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEditColor(color)} className="bg-white/90 hover:bg-white text-indigo-600 p-1 rounded shadow-sm"><Pencil size={12} /></button>
                                            <button onClick={() => deleteColor(color.id)} className="bg-red-500 hover:bg-red-600 text-white p-1 rounded shadow-sm"><Trash2 size={12} /></button>
                                        </div>
                                        <div className="h-24 bg-skin-base flex items-center justify-center overflow-hidden">
                                            {color.image ? <img src={color.image} alt={color.name} className="w-full h-full object-cover" /> : <div className="text-skin-muted"><ImageIcon size={32} /></div>}
                                        </div>
                                        <div className="p-2">
                                            <p className="font-medium text-sm truncate text-skin-base-text">{color.name}</p>
                                            <p className="text-xs text-danger">{color.type}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section >

            {/* MATERIAL LIBRARY */}
            < section className="bg-skin-card p-6 rounded-lg shadow-sm border border-skin-border" >
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Layers className="text-primary" /> {t('setMatTitle')}
                </h2>

                {/* Categories Management */}
                <div className="mb-8 bg-skin-accent p-4 rounded-lg">
                    <h3 className="font-semibold text-sm text-primary mb-2">{t('setMatCatTitle')}</h3>
                    <form
                        className="flex gap-2 mb-3"
                        onSubmit={(e) => { e.preventDefault(); addCategory(); }}
                    >
                        <input
                            type="text"
                            className="flex-1 rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            placeholder={t('catName')}
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            autoComplete="off"
                        />
                        <button type="submit" className="bg-primary text-white px-4 rounded hover:bg-primary-hover">
                            <Plus size={16} />
                        </button>
                    </form>
                    <div className="flex flex-col gap-2">
                        {materialCategories.map((cat, index) => (
                            <div key={cat} className="flex items-center justify-between bg-skin-card p-2 rounded border border-skin-border shadow-sm group">
                                <span className="font-semibold text-sm text-skin-base-text">{cat}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Reorder */}
                                    <button onClick={() => handleReorderCategory('material', index, 'up')} disabled={index === 0} className="p-1 hover:text-primary disabled:opacity-30"><ChevronUp size={14} /></button>
                                    <button onClick={() => handleReorderCategory('material', index, 'down')} disabled={index === materialCategories.length - 1} className="p-1 hover:text-primary disabled:opacity-30"><ChevronDown size={14} /></button>
                                    <div className="w-px h-4 bg-skin-border mx-1"></div>
                                    {/* Actions */}
                                    <button
                                        onClick={() => {
                                            const newName = prompt("Rename category:", cat);
                                            if (newName) handleRenameCategory('material', cat, newName);
                                        }}
                                        className="p-1 text-skin-muted hover:text-primary"
                                        title="Rename"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleMigrateCategory(cat, 'material')}
                                        className="p-1 text-skin-muted hover:text-indigo-500"
                                        title="Move to Color Library"
                                    >
                                        <ArrowRight size={14} />
                                    </button>
                                    <button onClick={() => deleteCategory(cat)} className="p-1 text-danger hover:bg-danger/10 rounded"><X size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Add Material Form */}
                <div id="material-form" className={`flex flex-col gap-4 mb-6 p-4 rounded-lg transition-colors ${editingMaterialId ? 'bg-skin-accent border border-skin-border' : 'bg-skin-base'}`}>
                    {editingMaterialId && (
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-primary flex items-center gap-2">
                                <Pencil size={16} /> Rediger materiale
                            </h3>
                            <button onClick={cancelEdit} className="text-sm text-skin-muted hover:text-skin-base-text">Annuller</button>
                        </div>
                    )}
                    <div className="flex gap-4 items-end flex-col md:flex-row">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-skin-muted mb-1">{t('matName')}</label>
                            <input
                                type="text"
                                value={newMaterial.name}
                                onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                                className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                                placeholder="..."
                            />
                        </div>
                        <div className="w-full md:w-32">
                            <label className="block text-xs font-medium text-skin-muted mb-1">{t('matCost')}</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={newMaterial.cost}
                                    onChange={(e) => setNewMaterial({ ...newMaterial, cost: e.target.value })}
                                    className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                                    placeholder="0.00"
                                />
                                <span className="absolute right-8 top-2 text-skin-muted text-xs pointer-events-none">
                                    {/* spacer */}
                                </span>
                            </div>
                        </div>
                        <div className="w-full md:w-40">
                            <label className="block text-xs font-medium text-skin-muted mb-1">{t('matCat')}</label>
                            <select
                                value={newMaterial.category}
                                onChange={(e) => setNewMaterial({ ...newMaterial, category: e.target.value })}
                                className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            >
                                <option value="" disabled>{t('lblSelect')}</option>
                                {materialCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="w-full">
                        <label className="block text-xs font-medium text-skin-muted mb-1">{t('setColorNote')}</label>
                        <textarea
                            value={newMaterial.note}
                            onChange={(e) => setNewMaterial({ ...newMaterial, note: e.target.value })}
                            className="w-full rounded border-skin-border border p-2 text-sm bg-skin-input text-skin-base-text"
                            rows="2"
                        />
                    </div>

                    <div className="flex justify-between items-center">
                        <label className="cursor-pointer bg-skin-card border border-skin-border hover:bg-skin-base py-2 px-3 rounded flex items-center gap-2 text-sm text-skin-base-text">
                            <ImageIcon size={16} />
                            {newMaterial.images?.length > 0 ? (
                                <span className="flex items-center gap-1">{newMaterial.images.length} billede(r)</span>
                            ) : (
                                t('btnUpload')
                            )}
                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleMatImageUpload} />
                        </label>

                        {/* Image Preview List */}
                        {(newMaterial.images || []).length > 0 && (
                            <div className="flex gap-2 overflow-x-auto py-1">
                                {newMaterial.images.map((img, idx) => (
                                    <div key={idx} className="relative w-12 h-12 flex-shrink-0 border rounded overflow-hidden group">
                                        <img src={img} alt="" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => removeNewMatImage(idx)}
                                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={handleSaveMaterial}
                            className={`${editingMaterialId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium`}
                        >
                            {editingMaterialId ? <Check size={16} /> : <Plus size={16} />}
                            {editingMaterialId ? 'Gem ændringer' : t('btnAdd')}
                        </button>
                    </div>
                </div>

                {/* Materials List */}
                <div className="space-y-6">
                    {materialCategories.map(cat => {
                        const catMaterials = groupedMaterials.groups[cat] || [];
                        if (catMaterials.length === 0) return null;
                        const isCollapsed = collapsedSections[`mat-${cat}`];

                        return (
                            <div key={cat} className="space-y-2">
                                <div
                                    className="flex items-center gap-2 cursor-pointer border-b pb-1 border-skin-border group"
                                    onClick={() => toggleSection(`mat-${cat}`)}
                                >
                                    {isCollapsed ? <ChevronRight size={16} className="text-skin-muted group-hover:text-primary" /> : <ChevronDown size={16} className="text-skin-muted group-hover:text-primary" />}
                                    <h4 className="font-semibold text-skin-base-text select-none text-sm">
                                        {cat} ({catMaterials.length})
                                    </h4>
                                </div>
                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 animate-fadeIn">
                                        {catMaterials.map(mat => (
                                            <div key={mat.id} className="relative group bg-skin-card border border-skin-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                                <div className="absolute top-1 right-1 flex gap-1  z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => startEditMaterial(mat)}
                                                        className="bg-white/90 hover:bg-white text-indigo-600 p-1 rounded shadow-sm"
                                                        title="Rediger"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteMaterial(mat.id)}
                                                        className="bg-danger hover:bg-red-600 text-white p-1 rounded shadow-sm"
                                                        title="Slet"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                                <div className="h-24 bg-skin-base flex items-center justify-center overflow-hidden">
                                                    {mat.images && mat.images.length > 0 ? (
                                                        <div className="w-full h-full relative">
                                                            <img src={mat.images[0]} alt={mat.name} className="w-full h-full object-cover" />
                                                            {mat.images.length > 1 && (
                                                                <div className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1 m-1 rounded">
                                                                    +{mat.images.length - 1}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : mat.image ? (
                                                        <img src={mat.image} alt={mat.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="text-gray-300"><ImageIcon size={32} /></div>
                                                    )}
                                                </div>
                                                <div className="p-2">
                                                    <p className="font-medium text-sm truncate" title={mat.name}>{mat.name}</p>
                                                    <div className="flex justify-between items-center text-xs mt-1">
                                                        <span className="text-indigo-600 font-semibold truncate max-w-[50%]">{mat.category}</span>
                                                        {mat.cost && <span className="text-gray-600 font-mono">{mat.cost} {currency}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* Uncategorized Materials */}
                    {materials.filter(m => !materialCategories.includes(m.category)).length > 0 && (
                        <div className="space-y-2 mt-4">
                            <h4 className="font-semibold text-gray-700 select-none text-sm border-b pb-1 border-gray-200">{t('otherCategory') || 'Andet'}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                {materials.filter(m => !materialCategories.includes(m.category)).map(mat => (
                                    <div key={mat.id} className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                        {/* Same actions for uncategorized */}
                                        <div className="absolute top-1 right-1 flex gap-1  z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEditMaterial(mat)} className="bg-white/90 hover:bg-white text-indigo-600 p-1 rounded shadow-sm"><Pencil size={12} /></button>
                                            <button onClick={() => deleteMaterial(mat.id)} className="bg-red-500 hover:bg-red-600 text-white p-1 rounded shadow-sm"><Trash2 size={12} /></button>
                                        </div>
                                        <div className="h-24 bg-gray-100 flex items-center justify-center overflow-hidden">
                                            {mat.images && mat.images.length > 0 ? (
                                                <div className="w-full h-full relative">
                                                    <img src={mat.images[0]} alt={mat.name} className="w-full h-full object-cover" />
                                                    {mat.images.length > 1 && (
                                                        <div className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1 m-1 rounded">
                                                            +{mat.images.length - 1}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : mat.image ? (
                                                <img src={mat.image} alt={mat.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-gray-300"><ImageIcon size={32} /></div>
                                            )}
                                        </div>
                                        <div className="p-2">
                                            <p className="font-medium text-sm truncate">{mat.name}</p>
                                            <div className="flex justify-between items-center text-xs mt-1">
                                                <span className="text-indigo-600 font-semibold truncate max-w-[50%]">{mat.category}</span>
                                                {mat.cost && <span className="text-gray-600 font-mono">{mat.cost} {currency}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section >
        </div >
    );
};

export default Settings;
