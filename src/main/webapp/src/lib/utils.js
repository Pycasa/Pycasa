import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

export function formatFileSize(bytes) {
	const n = Number(bytes);
	if (bytes == null || isNaN(n) || n < 0) return '—';
	if (n === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(n) / Math.log(k));
	return parseFloat((n / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}