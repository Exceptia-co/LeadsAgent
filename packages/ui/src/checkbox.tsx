import * as React from "react";
import { cn } from "./lib/utils";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, indeterminate, ...props }, ref) => {
    const checkboxRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => checkboxRef.current!, []);

    React.useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate || false;
      }
    }, [indeterminate]);

    const checkbox = (
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 focus:ring-2 focus:ring-offset-0",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        ref={checkboxRef}
        {...props}
      />
    );

    if (label || description) {
      return (
        <div className="flex items-start space-x-3">
          <div className="flex items-center h-5">{checkbox}</div>
          <div className="min-w-0 flex-1">
            {label && (
              <label className="text-sm font-medium text-gray-900 select-none cursor-pointer">
                {label}
              </label>
            )}
            {description && <p className="text-sm text-gray-500">{description}</p>}
          </div>
        </div>
      );
    }

    return checkbox;
  },
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
