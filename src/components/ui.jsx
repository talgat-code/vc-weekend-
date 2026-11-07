import { useId } from "react";
import { Check, CircleHelp } from "lucide-react";

const fieldHelp = [
  ["номер валютного договора", "Номер из подписанного договора. Он связывает платёж с валютным контролем, поэтому перепишите его без изменений."],
  ["сторона в казахстане", "Юридическое название вашей компании, как оно указано в договоре."],
  ["иностранный контрагент", "Название продавца или поставщика из договора. Сверьте написание с инвойсом."],
  ["сумма и валюта", "Общая сумма договора и валюта расчёта. По ним банк сверит будущий платёж."],
  ["срок действия договора", "Дата, до которой действует договор и можно проводить операции по нему."],
  ["банк получателя", "Банк иностранного контрагента, куда будет направлен перевод."],
  ["swift и счёт контрагента", "SWIFT-код банка и счёт получателя из договора или банковских реквизитов."],
  ["номер документа", "Номер инвойса или заявления, по которому банк найдёт документ."],
  ["дата документа", "Дата, указанная в документе-основании. Проверьте её по оригиналу."],
  ["счёт списания комиссии", "Счёт, с которого будет списана комиссия за перевод."],
  ["счёт списания", "Счёт компании, с которого будут списаны сумма перевода и комиссия."],
  ["сумма перевода", "Сумма к отправке. Сверьте её с инвойсом и суммой в назначении."],
  ["дата валютирования", "Дата, когда банк должен провести валютную операцию и передать средства банку получателя."],
  ["swift банка получателя", "Уникальный код банка получателя для международного перевода."],
  ["банк-посредник", "Заполняйте только если он указан в банковских реквизитах. Иначе оставьте поле пустым."],
  ["кнп", "Код назначения платежа, который помогает банку классифицировать операцию."],
  ["назначение перевода", "Коротко объясните, за что платите. Укажите номер инвойса и сумму точно как в документе."],
  ["номер и дата документа-основания", "Реквизиты инвойса, договора или другого документа, подтверждающего платёж."],
  ["наименование получателя", "Полное юридическое название получателя, как в банковских реквизитах."],
  ["страна резидентства", "Страна, где получатель зарегистрирован как компания или гражданин."],
  ["счёт получателя (iban)", "IBAN или другой номер счёта получателя. Сверьте каждую цифру с реквизитами."],
  ["кбе", "Код бенефициара из банковских реквизитов получателя."],
  ["страна получателя", "Страна банка или адреса получателя, указанные в реквизитах."],
  ["тип адреса", "Выберите, какой адрес указан в документах: юридический или фактический."],
  ["тип комиссии", "Определяет, кто оплачивает банковские комиссии: OUR, BEN или SHA."],
];

function getFieldHelp(label) {
  const normalized = String(label).toLocaleLowerCase();
  return fieldHelp.find(([key]) => normalized.includes(key))?.[1]
    ?? "Подсказка помогает понять, что указать в поле и зачем это нужно банку. Сверьте значение с документами.";
}

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

export function HelpTooltip({ text, label = "Что это и зачем нужно" }) {
  const tooltipId = useId();
  return (
    <span className="help-tooltip">
      <button
        type="button"
        className="help-tooltip-trigger"
        aria-label={label}
        aria-describedby={tooltipId}
        onClick={(event) => event.stopPropagation()}
      >
        <CircleHelp size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <span id={tooltipId} className="help-tooltip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

export function Field({ id, label, hint, marker, help, children, className = "", required = false }) {
  return (
    <div className={`field ${className}`}>
      <div className="field-heading">
        <span className="field-label-wrap">
          <label className="field-label" htmlFor={id}>
            {label}{required && <span className="required-mark"> *</span>}
          </label>
          <HelpTooltip text={help ?? getFieldHelp(label)} label={`Пояснение: ${label}`} />
        </span>
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

export function Toggle({ checked, onChange, label, description, help = "Срочный перевод ускоряет обработку в рабочий день и добавляет отдельную комиссию. Включайте его только при необходимости." }) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-label-row"><span className="toggle-label">{label}</span><HelpTooltip text={help} label={`Пояснение: ${label}`} /></span>
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

export function SectionTitle({ title, description, trailing, help = "Этот раздел помогает заполнить один этап перевода. Проверьте данные перед переходом дальше." }) {
  return (
    <div className="section-title-row">
      <div>
        <div className="section-title-heading"><h2 className="section-title">{title}</h2><HelpTooltip text={help} label={`Пояснение: ${title}`} /></div>
        {description && <p className="section-description">{description}</p>}
      </div>
      {trailing}
    </div>
  );
}
