import { Check } from "lucide-react";

const buttonStyles = {
  primary: "button button-primary",
  secondary: "button button-secondary",
  quiet: "button button-quiet",
  danger: "button button-danger",
};

export function Button({ variant = "primary", className = "", type = "button", ...props }) {
  return <button type={type} className={`${buttonStyles[variant] ?? buttonStyles.primary} ${className}`} {...props} />;
}

export function Input({ className = "", ...props }) {
  return <input className={`control ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }) {
  return (
    <select className={`control control-select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`control control-textarea ${className}`} {...props} />;
}

export function Field({ id, label, hint, marker, children, className = "", required = false }) {
  return (
    <div className={`field ${className}`}>
      <div className="field-heading">
        <label className="field-label" htmlFor={id}>
          {label}{required && <span className="required-mark"> *</span>}
        </label>
        {marker && <span className="field-marker">{marker}</span>}
      </div>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function Checkbox({ checked, onChange, children, className = "" }) {
  return (
    <label className={`check-row ${className}`}>
      <input
        type="checkbox"
        className="check-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="check-box" aria-hidden="true">{checked && <Check size={13} strokeWidth={2.5} />}</span>
      <span className="check-copy">{children}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? "toggle-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </label>
  );
}

export function SectionTitle({ title, description, trailing }) {
  return (
    <div className="section-title-row">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {trailing}
    </div>
  );
}
