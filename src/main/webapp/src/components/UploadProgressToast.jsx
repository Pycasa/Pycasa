import React from 'react';
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUpload } from '@/context/UploadContext';

const UploadProgressToast = () => {
    const { state, cancel } = useUpload();
    const { uploading, current, total, currentFile, failed } = state;

    const isDone = !uploading && total > 0;
    const visible = uploading || isDone;

    if (!visible) return null;

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const hasError = failed > 0;

    return (
        <div className="fixed bottom-5 left-5 z-[9999] animate-in slide-in-from-bottom-4 duration-300">
            <div
                className="flex items-center gap-3 bg-white dark:bg-[#1a1a2e] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                style={{ minWidth: 280, maxWidth: 340 }}
            >
                {/* Thumbnail / icon strip */}
                <div className="shrink-0 w-16 h-16 bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center relative overflow-hidden">
                    {isDone ? (
                        hasError ? (
                            <AlertCircle className="w-7 h-7 text-red-400" />
                        ) : (
                            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                        )
                    ) : (
                        <>
                            <Upload className="w-6 h-6 text-indigo-400" />
                            {/* Animated progress ring overlay */}
                            <svg
                                className="absolute inset-0 w-full h-full -rotate-90"
                                viewBox="0 0 64 64"
                            >
                                <circle
                                    cx="32"
                                    cy="32"
                                    r="26"
                                    fill="none"
                                    stroke="rgba(99,102,241,0.15)"
                                    strokeWidth="4"
                                />
                                <circle
                                    cx="32"
                                    cy="32"
                                    r="26"
                                    fill="none"
                                    stroke="rgba(99,102,241,0.8)"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 26}`}
                                    strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
                                    style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                                />
                            </svg>
                        </>
                    )}
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0 py-3 pr-1">
                    <p className="text-[11px] font-medium text-slate-400 dark:text-white/40 uppercase tracking-wide">
                        {isDone
                            ? hasError
                                ? 'Upload completed with errors'
                                : 'Uploaded to'
                            : 'Uploading to'}
                    </p>
                    <p className="text-sm font-bold text-slate-800 dark:text-white/90 truncate leading-tight mt-0.5">
                        Photo library
                    </p>
                    {isDone ? (
                        <p
                            className={`text-xs mt-1 font-medium ${hasError ? 'text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}
                        >
                            {current} uploaded{hasError ? `, ${failed} failed` : ' successfully'}
                        </p>
                    ) : (
                        <p className="text-xs text-slate-500 dark:text-white/40 mt-1 font-medium tabular-nums">
                            {current} of {total}
                            {currentFile && (
                                <span className="ml-1.5 text-slate-400 dark:text-white/30 font-normal truncate block max-w-[160px]">
                                    {currentFile}
                                </span>
                            )}
                        </p>
                    )}
                </div>

                {/* Stop / close button */}
                <div className="shrink-0 pr-3">
                    <button
                        onClick={cancel}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors ${
                            isDone
                                ? 'text-slate-400 dark:text-white/30 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                                : 'text-red-500 border-red-200 dark:border-red-900/40 hover:bg-red-50 dark:hover:bg-red-900/20'
                        }`}
                        title={isDone ? 'Dismiss' : 'Cancel upload'}
                    >
                        {isDone ? <X className="w-3.5 h-3.5" /> : 'Stop'}
                    </button>
                </div>
            </div>

            {/* Progress bar */}
            {!isDone && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-200 dark:bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-500 transition-all duration-400 ease-out"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}
        </div>
    );
};

export default UploadProgressToast;
