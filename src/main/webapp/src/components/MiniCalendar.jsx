import React, { useState } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    addMonths,
    subMonths,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isAfter,
    isBefore,
    parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * MiniCalendar — a fully theme-aware, Tailwind-only date picker.
 *
 * Props:
 *   value      string | null   ISO date string "yyyy-MM-dd"
 *   onChange   (iso: string | null) => void
 *   minDate    string | null   ISO date string — days before are disabled
 *   maxDate    string | null   ISO date string — days after are disabled
 */
const MiniCalendar = ({ value, onChange, minDate, maxDate }) => {
    const today = new Date();
    const selected = value ? parseISO(value) : null;
    const min = minDate ? parseISO(minDate) : null;
    const max = maxDate ? parseISO(maxDate) : null;

    const [viewMonth, setViewMonth] = useState(selected ?? today);

    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const isDisabled = (day) => {
        if (min && isBefore(day, min)) return true;
        if (max && isAfter(day, max)) return true;
        return false;
    };

    const handleDay = (day) => {
        if (isDisabled(day)) return;
        if (selected && isSameDay(day, selected)) {
            onChange(null); // deselect
        } else {
            onChange(format(day, 'yyyy-MM-dd'));
        }
    };

    return (
        <div className="select-none font-[inherit]">
            {/* Month navigation */}
            <div className="flex items-center justify-between px-1 pb-2">
                <button
                    onClick={() => setViewMonth((m) => subMonths(m, 1))}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {format(viewMonth, 'MMMM yyyy')}
                </span>
                <button
                    onClick={() => setViewMonth((m) => addMonths(m, 1))}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                    <div
                        key={d}
                        className="text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 py-0.5"
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((day) => {
                    const outside = !isSameMonth(day, viewMonth);
                    const sel = selected && isSameDay(day, selected);
                    const todayDay = isSameDay(day, today);
                    const disabled = isDisabled(day);

                    return (
                        <button
                            key={day.toISOString()}
                            onClick={() => handleDay(day)}
                            disabled={disabled}
                            className={[
                                'text-[11px] h-7 w-full rounded transition-colors leading-none',
                                sel
                                    ? 'bg-primary text-white font-semibold'
                                    : todayDay && !outside
                                      ? 'bg-primary/10 text-primary font-semibold dark:bg-primary/20'
                                      : outside
                                        ? 'text-slate-300 dark:text-slate-600'
                                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700',
                                disabled && !sel
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'cursor-pointer',
                            ].join(' ')}
                        >
                            {format(day, 'd')}
                        </button>
                    );
                })}
            </div>

            {/* Today / Clear actions */}
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                    onClick={() => {
                        const t = format(today, 'yyyy-MM-dd');
                        if (!isDisabled(today)) onChange(t);
                    }}
                    className="text-[10px] font-medium text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={isDisabled(today)}
                >
                    Today
                </button>
                {selected && (
                    <button
                        onClick={() => onChange(null)}
                        className="text-[10px] font-medium text-slate-400 hover:text-red-500 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
};

export default MiniCalendar;
