/**
 * Input.tsx — Input form du design system (R3.3).
 * Compatible react-hook-form (forwardRef).
 */
import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, required, className, id, ...rest }, ref) => {
    const inputId = id || rest.name || undefined;
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold text-neutral-700 uppercase tracking-wide"
          >
            {label}
            {required && <span className="text-rose-600 ml-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : helper ? `${inputId}-help` : undefined}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl text-sm',
            'border bg-white text-neutral-900',
            'placeholder:text-neutral-400',
            'focus:outline-none focus:ring-4 focus:border-primary-400',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors',
            error
              ? 'border-rose-400 focus:ring-rose-200/60'
              : 'border-neutral-200 focus:ring-primary-200/60',
            className,
          )}
          {...rest}
        />
        {error && (
          <p id={`${inputId}-err`} className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </p>
        )}
        {!error && helper && (
          <p id={`${inputId}-help`} className="mt-1 text-xs text-neutral-500">
            {helper}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, required, className, id, ...rest }, ref) => {
    const inputId = id || rest.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold text-neutral-700 uppercase tracking-wide"
          >
            {label}
            {required && <span className="text-rose-600 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl text-sm min-h-[6rem] resize-y',
            'border bg-white text-neutral-900',
            'focus:outline-none focus:ring-4',
            error
              ? 'border-rose-400 focus:ring-rose-200/60'
              : 'border-neutral-200 focus:ring-primary-200/60',
            className,
          )}
          {...rest}
        />
        {error && (
          <p className="mt-1 text-xs font-semibold text-rose-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </p>
        )}
        {!error && helper && <p className="mt-1 text-xs text-neutral-500">{helper}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
