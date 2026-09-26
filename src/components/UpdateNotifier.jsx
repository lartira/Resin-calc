import React, { useState, useEffect, useRef } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { getSystemLanguage } from '../utils/systemLanguage';
import { updateTranslations } from '../utils/updateTranslations';

const SKIPPED_VERSION_KEY = 'skippedUpdateVersion';

// The popup always uses the system language, independent of the in-app setting
const texts = updateTranslations[getSystemLanguage()] || updateTranslations.en;
const t = (key) => texts[key] || updateTranslations.en[key] || key;

// Release notes from GitHub arrive as HTML; show them as plain text only,
// keeping line breaks and list bullets
const toPlainText = (html) => {
    if (!html) return '';
    const withBreaks = html
        .replace(/<li[^>]*>/gi, '\n• ')
        .replace(/<br\s*\/?>|<\/(p|ul|ol|div|h[1-6])>/gi, '\n');
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};

const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

const readSkippedVersion = () => {
    try { return localStorage.getItem(SKIPPED_VERSION_KEY); } catch { return null; }
};

/**
 * Listens for 'update-status' events from the main process and shows an
 * in-app popup when a new version is published on GitHub.
 */
const UpdateNotifier = () => {
    // stage: null | 'available' | 'downloading' | 'downloaded' | 'error'
    const [stage, setStage] = useState(null);
    const [visible, setVisible] = useState(false);
    const [info, setInfo] = useState({});
    const [progress, setProgress] = useState(null);
    const [toast, setToast] = useState(null); // Result of a manual check
    const stageRef = useRef(null);

    const setStageBoth = (s) => { stageRef.current = s; setStage(s); };

    useEffect(() => {
        if (!window.electronAPI?.onUpdateStatus) return;

        return window.electronAPI.onUpdateStatus((status) => {
            const current = stageRef.current;
            const busy = current === 'downloading' || current === 'downloaded';

            switch (status.state) {
                case 'available': {
                    if (busy) return; // A background re-check must not reset an ongoing download
                    if (!status.manual && readSkippedVersion() === status.version) return;
                    setInfo({
                        version: status.version,
                        releaseDate: status.releaseDate,
                        notes: toPlainText(status.releaseNotes)
                    });
                    setStageBoth('available');
                    setVisible(true);
                    setToast(null);
                    break;
                }
                case 'not-available':
                    if (status.manual) setToast({ type: 'ok', text: t('updNoUpdate') });
                    break;
                case 'downloading':
                    setStageBoth('downloading');
                    setProgress(status);
                    break;
                case 'downloaded':
                    setInfo(prev => ({ ...prev, version: status.version || prev.version }));
                    setStageBoth('downloaded');
                    setVisible(true);
                    break;
                case 'error':
                    if (current === 'downloading') {
                        setStageBoth('error');
                        setInfo(prev => ({ ...prev, error: status.message }));
                        setVisible(true);
                    } else if (status.manual) {
                        setToast({ type: 'error', text: t('updCheckFailed') });
                    }
                    break;
                default:
                    break;
            }
        });
    }, []);

    // Auto-hide manual check results
    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 5000);
        return () => clearTimeout(id);
    }, [toast]);

    const handleDownload = () => {
        setStageBoth('downloading');
        setProgress(null);
        window.electronAPI.downloadUpdate();
    };

    const handleSkip = () => {
        try { localStorage.setItem(SKIPPED_VERSION_KEY, info.version); } catch { /* ignore */ }
        setVisible(false);
        setStageBoth(null);
    };

    const handleLater = () => {
        setVisible(false);
        // Keep 'downloading'/'downloaded' so the popup returns when the download finishes
        if (stageRef.current === 'available' || stageRef.current === 'error') setStageBoth(null);
    };

    const percent = Math.round(progress?.percent || 0);

    return (
        <>
            {visible && stage && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="update-title"
                        className="bg-skin-card text-skin-base-text border border-skin-border rounded-xl shadow-2xl w-full max-w-md"
                    >
                        <div className="flex items-start justify-between gap-4 p-5 border-b border-skin-border">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                    {stage === 'downloaded' ? <CheckCircle size={22} />
                                        : stage === 'error' ? <AlertTriangle size={22} />
                                            : <Download size={22} />}
                                </div>
                                <div>
                                    <h2 id="update-title" className="text-lg font-bold">
                                        {stage === 'downloaded' ? t('updReadyTitle')
                                            : stage === 'error' ? t('updErrorTitle')
                                                : t('updAvailableTitle')}
                                    </h2>
                                    <p className="text-sm text-skin-muted">
                                        {t('updVersion')} {info.version}
                                        <span className="mx-1">·</span>
                                        {t('updCurrent')} {import.meta.env.PACKAGE_VERSION}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleLater}
                                className="p-1 rounded-md text-skin-muted hover:text-skin-base-text hover:bg-skin-accent"
                                aria-label={t('updLater')}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {stage === 'available' && (
                                <>
                                    <p className="text-sm">{t('updAvailableText')}</p>
                                    {info.notes && (
                                        <div>
                                            <h3 className="text-xs font-semibold uppercase tracking-wide text-skin-muted mb-1">
                                                {t('updWhatsNew')}
                                            </h3>
                                            <div className="text-sm whitespace-pre-line max-h-40 overflow-y-auto bg-skin-base border border-skin-border rounded-lg p-3">
                                                {info.notes}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {stage === 'downloading' && (
                                <div>
                                    <div className="flex justify-between text-sm mb-2">
                                        <span>{t('updDownloading')}</span>
                                        <span className="font-medium tabular-nums">{percent}%</span>
                                    </div>
                                    <div
                                        className="h-2 bg-skin-base border border-skin-border rounded-full overflow-hidden"
                                        role="progressbar"
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={percent}
                                    >
                                        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${percent}%` }} />
                                    </div>
                                    {progress?.total > 0 && (
                                        <p className="text-xs text-skin-muted mt-2 tabular-nums">
                                            {formatMB(progress.transferred)} / {formatMB(progress.total)} MB
                                        </p>
                                    )}
                                </div>
                            )}

                            {stage === 'downloaded' && (
                                <p className="text-sm">{t('updReadyText')}</p>
                            )}

                            {stage === 'error' && (
                                <p className="text-sm">{t('updErrorText')}</p>
                            )}
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 p-5 pt-0">
                            {stage === 'available' && (
                                <>
                                    <button onClick={handleLater} className="px-4 py-2 text-sm rounded-lg border border-skin-border hover:bg-skin-accent">
                                        {t('updLater')}
                                    </button>
                                    <button onClick={handleDownload} className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium flex items-center gap-2">
                                        <Download size={16} /> {t('updDownload')}
                                    </button>
                                    {/* Own row so long translations never push the main buttons around */}
                                    <button onClick={handleSkip} className="basis-full text-right text-xs text-skin-muted hover:text-skin-base-text hover:underline pt-1">
                                        {t('updSkip')}
                                    </button>
                                </>
                            )}
                            {stage === 'downloading' && (
                                <button onClick={handleLater} className="px-4 py-2 text-sm rounded-lg border border-skin-border hover:bg-skin-accent">
                                    {t('updHide')}
                                </button>
                            )}
                            {stage === 'downloaded' && (
                                <>
                                    <button onClick={handleLater} className="px-4 py-2 text-sm rounded-lg border border-skin-border hover:bg-skin-accent">
                                        {t('updLater')}
                                    </button>
                                    <button onClick={() => window.electronAPI.installUpdate()} className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium flex items-center gap-2">
                                        <RefreshCw size={16} /> {t('updInstall')}
                                    </button>
                                </>
                            )}
                            {stage === 'error' && (
                                <>
                                    <button onClick={handleLater} className="px-4 py-2 text-sm rounded-lg border border-skin-border hover:bg-skin-accent">
                                        {t('updClose')}
                                    </button>
                                    <button onClick={handleDownload} className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary-hover text-white font-medium">
                                        {t('updRetry')}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Download continues while the popup is hidden */}
            {!visible && stage === 'downloading' && (
                <button
                    onClick={() => setVisible(true)}
                    className="fixed bottom-4 left-4 bg-skin-card border border-skin-border text-skin-base-text px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium z-50"
                >
                    <Download size={16} className="text-primary" />
                    {t('updDownloading')} <span className="tabular-nums">{percent}%</span>
                </button>
            )}

            {toast && (
                <div
                    role="status"
                    className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg text-sm font-medium z-[95] flex items-center gap-2 border bg-skin-card ${toast.type === 'error' ? 'border-red-500 text-red-600' : 'border-primary text-primary'}`}
                >
                    {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                    {toast.text}
                </div>
            )}
        </>
    );
};

export default UpdateNotifier;
