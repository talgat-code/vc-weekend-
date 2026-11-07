import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  FileText,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button, Checkbox, Field, Input, SectionTitle, Select, Textarea, Toggle } from "./components/ui.jsx";

const steps = ["Валютный договор", "Заявление", "Платёж", "Статус"];
const invoiceAmount = 48500;

const contracts = [
  {
    id: "or-482",
    number: "ВЭД-2026-041",
    title: "Поставка промышленного оборудования",
    partner: "Ningbo Bright Tools Co., Ltd.",
    amount: "48 500 USD",
    endDate: "31.12.2026",
  },
  {
    id: "or-318",
    number: "ВЭД-2025-118",
    title: "Комплектующие для производства",
    partner: "Shenzhen Yulan Industrial Ltd.",
    amount: "32 000 USD",
    endDate: "30.06.2027",
  },
];

const initialContract = {
  company: "ТОО «Orda Export»",
  counterparty: contracts[0].partner,
  amount: "48500",
  currency: "USD",
  endDate: "31.12.2026",
  bank: "Bank of China, Shanghai Branch",
  swift: "BKCHCNBJ92A",
  account: "6222 0888 1100 4839 05",
};

const initialPayment = {
  debitAccount: "KZ14998CTB0000012847 — USD",
  amount: "48500",
  valueDate: "2026-11-10",
  urgent: false,
  swift: "BKCHCNBJ92A",
  intermediary: "",
  knp: "710",
  purpose: "Оплата по инвойсу INV-284 от 06.11.2026, 48 000 USD",
  document: "INV-284 от 06.11.2026",
  recipient: "Ningbo Bright Tools Co., Ltd.",
  residence: "Китай",
  iban: "6222 0888 1100 4839 05",
  kbe: "17",
  country: "Китай",
  addressType: "Юридический адрес",
  feeType: "SHA",
  feeAccount: "KZ14998CTB0000012847 — USD",
};

function formatNumber(value) {
  const parsed = Number(String(value).replace(/[\s,]/g, ""));
  return Number.isFinite(parsed) ? new Intl.NumberFormat("ru-RU").format(parsed) : value;
}

function extractPurposeAmount(text) {
  const match = text.match(/([\d][\d\s.,]*)\s*USD/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/[\s,]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function ProgressStepper({ current, onGoTo }) {
  return (
    <nav className="stepper" aria-label="Этапы подготовки перевода">
      {steps.map((label, index) => {
        const number = index + 1;
        const isComplete = current > number;
        const isCurrent = current === number;
        const canVisit = number < current;
        return (
          <div className={`stepper-item ${isCurrent ? "is-current" : ""} ${isComplete ? "is-complete" : ""}`} key={label}>
            <button
              type="button"
              className="stepper-button"
              onClick={() => canVisit && onGoTo(number)}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`Шаг ${number}: ${label}${isComplete ? ", завершён" : isCurrent ? ", текущий" : ""}`}
              disabled={!canVisit && !isCurrent}
            >
              <span className="stepper-number">{isComplete ? <Check size={15} /> : number}</span>
              <span className="stepper-label">{label}</span>
            </button>
            {index < steps.length - 1 && <span className="stepper-line" aria-hidden="true" />}
          </div>
        );
      })}
    </nav>
  );
}

function AIHint({ children = "Предложено AI, проверьте" }) {
  return <span className="ai-hint"><Sparkles size={12} />{children}</span>;
}

function ContractStep({
  contractSource,
  setContractSource,
  contractData,
  setContractData,
  contractNumber,
  setContractNumber,
  selectedContract,
  setSelectedContract,
  contractFile,
  setContractFile,
}) {
  const fileInput = useRef(null);
  const fromAI = contractSource === "ai";
  const update = (key, value) => setContractData((current) => ({ ...current, [key]: value }));

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setContractSource("ai");
    setContractData({ ...initialContract });
    setContractNumber("");
    setContractFile(file.name);
    event.target.value = "";
    // The prototype demonstrates extraction locally and does not upload the selected file.
  }

  return (
    <div className="step-content">
      <SectionTitle
        title="Выберите валютный договор"
        description="Можно взять договор из списка или загрузить файл, чтобы помощник предложил данные для проверки."
      />

      <div className="mode-switch" role="tablist" aria-label="Источник договора">
        <button
          type="button"
          role="tab"
          aria-selected={!fromAI}
          className={!fromAI ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => setContractSource("existing")}
        >
          Мои договоры
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={fromAI}
          className={fromAI ? "mode-tab mode-tab-active" : "mode-tab"}
          onClick={() => fileInput.current?.click()}
        >
          Загрузить договор
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={handleFile}
          aria-label="Выберите файл валютного договора"
        />
      </div>

      {!fromAI ? (
        <div className="contract-list" aria-label="Список валютных договоров">
          {contracts.map((contract) => (
            <button
              type="button"
              key={contract.id}
              className={`contract-option ${selectedContract.id === contract.id ? "contract-option-selected" : ""}`}
              onClick={() => {
                setSelectedContract(contract);
                setContractNumber(contract.number);
                setContractData({
                  ...initialContract,
                  counterparty: contract.partner,
                  amount: contract.amount.replace(/[^\d]/g, ""),
                  endDate: contract.endDate,
                });
              }}
              aria-pressed={selectedContract.id === contract.id}
            >
              <span className="contract-radio" aria-hidden="true">{selectedContract.id === contract.id && <span />}</span>
              <span className="contract-option-copy">
                <span className="contract-option-title">{contract.title}</span>
                <span className="contract-option-meta">{contract.number} — {contract.partner}</span>
              </span>
              <span className="contract-option-amount">{contract.amount}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="upload-summary">
          <span className="upload-summary-icon"><FileCheck2 size={19} /></span>
          <span className="upload-summary-copy">
            <strong>{contractFile || "Договор выбран для разбора"}</strong>
            <span>Помощник извлёк поля из файла. Сверьте каждое значение с оригиналом.</span>
          </span>
          <BadgeCheck size={19} className="success-icon" />
        </div>
      )}

      <div className="form-section-heading">
        <h3>Данные договора</h3>
        <span>Проверьте перед продолжением</span>
      </div>
      <div className="form-grid">
        <Field id="contract-number" label="Номер валютного договора" required marker={fromAI ? "Введите вручную" : undefined}>
          <Input id="contract-number" value={contractNumber} onChange={(event) => setContractNumber(event.target.value)} placeholder="Например, ВЭД-2026-041" />
        </Field>
        <Field id="contract-company" label="Сторона в Казахстане" marker={fromAI && <AIHint />}>
          <Input id="contract-company" value={contractData.company} onChange={(event) => update("company", event.target.value)} />
        </Field>
        <Field id="contract-counterparty" label="Иностранный контрагент" marker={fromAI && <AIHint />}>
          <Input id="contract-counterparty" value={contractData.counterparty} onChange={(event) => update("counterparty", event.target.value)} />
        </Field>
        <div className="field">
          <div className="field-heading">
            <label className="field-label" htmlFor="contract-amount">Сумма и валюта</label>
            {fromAI && <AIHint />}
          </div>
          <div className="input-combo">
            <Input id="contract-amount" value={contractData.amount} onChange={(event) => update("amount", event.target.value)} inputMode="decimal" />
            <Select aria-label="Валюта договора" value={contractData.currency} onChange={(event) => update("currency", event.target.value)}>
              <option>USD</option><option>EUR</option><option>CNY</option><option>GBP</option>
            </Select>
          </div>
        </div>
        <Field id="contract-expiry" label="Срок действия договора" marker={fromAI && <AIHint />}>
          <Input id="contract-expiry" value={contractData.endDate} onChange={(event) => update("endDate", event.target.value)} placeholder="ДД.ММ.ГГГГ" />
        </Field>
        <Field id="contract-bank" label="Банк получателя" marker={fromAI && <AIHint />}>
          <Input id="contract-bank" value={contractData.bank} onChange={(event) => update("bank", event.target.value)} />
        </Field>
        <Field id="contract-swift" label="SWIFT и счёт контрагента" className="field-span-2" marker={fromAI && <AIHint />}>
          <Input id="contract-swift" value={`${contractData.swift} — ${contractData.account}`} onChange={(event) => {
            const [swift = "", ...account] = event.target.value.split("—");
            update("swift", swift.trim());
            update("account", account.join("—").trim());
          }} />
        </Field>
      </div>
      {fromAI && <p className="form-note"><CircleHelp size={15} /> Номер договора не найден в выбранном фрагменте. Введите его так, как он указан в подписанном документе.</p>}
    </div>
  );
}

function ApplicationStep({ application, setApplication }) {
  const fileInput = useRef(null);
  const missingFile = !application.fileName;
  const update = (key, value) => setApplication((current) => ({ ...current, [key]: value }));

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (file) update("fileName", file.name);
    event.target.value = "";
  }

  return (
    <div className="step-content">
      <SectionTitle
        title="Подготовьте заявление"
        description="Укажите реквизиты документа и приложите инвойс или другой документ, который подтверждает платёж."
      />

      <div className="form-grid">
        <Field id="application-number" label="Номер документа" required>
          <Input id="application-number" value={application.number} onChange={(event) => update("number", event.target.value)} />
        </Field>
        <Field id="application-date" label="Дата документа" required>
          <Input id="application-date" type="date" value={application.date} onChange={(event) => update("date", event.target.value)} />
        </Field>
      </div>

      <div className="choice-block">
        <div>
          <h3 className="choice-title">Заявление связано с валютным договором?</h3>
          <p className="choice-description">Привязка помогает банку сопоставить документ с условиями договора.</p>
        </div>
        <div className="segmented-choice" role="group" aria-label="Привязка к валютному договору">
          {[true, false].map((value) => (
            <button
              type="button"
              key={String(value)}
              className={application.linked === value ? "segmented-choice-active" : ""}
              onClick={() => update("linked", value)}
              aria-pressed={application.linked === value}
            >
              {value ? "Да, привязать" : "Нет"}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section-heading">
        <h3>Подтверждающие документы</h3>
        <span>PDF, JPG или PNG</span>
      </div>
      {missingFile ? (
        <div className="upload-area">
          <span className="upload-area-icon"><Upload size={19} /></span>
          <div className="upload-area-copy">
            <strong>Добавьте инвойс или подтверждающий документ</strong>
            <span>Можно выбрать файл на устройстве или добавить пример для демо.</span>
          </div>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>Выбрать файл</Button>
          <Button variant="quiet" onClick={() => update("fileName", "INV-284-demo.pdf")}>Добавить демо-инвойс</Button>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFile} aria-label="Загрузить подтверждающий документ" />
        </div>
      ) : (
        <div className="attached-file">
          <span className="attached-file-icon"><FileText size={18} /></span>
          <span className="attached-file-name">{application.fileName}</span>
          <span className="attached-file-status"><CheckCircle2 size={15} /> Добавлен</span>
          <button type="button" className="text-button" onClick={() => update("fileName", "")}>Удалить</button>
        </div>
      )}

      {missingFile && (
        <div className="missing-notice" role="status">
          <span className="missing-notice-icon"><CircleHelp size={17} /></span>
          <div>
            <strong>Не хватает: подтверждающий документ</strong>
            <p>Следующий шаг: приложите инвойс, по которому готовите перевод. После этого можно перейти к платёжным реквизитам.</p>
          </div>
          <Button variant="quiet" className="notice-action" onClick={() => fileInput.current?.click()}>Загрузить документ</Button>
        </div>
      )}
    </div>
  );
}

function PaymentStep({ payment, setPayment, signers, setSigners, consent, setConsent, onSubmit, analysis }) {
  const purposeAmount = extractPurposeAmount(payment.purpose);
  const mismatch = purposeAmount !== invoiceAmount;
  const amountDiffers = Number(payment.amount) !== invoiceAmount;
  const update = (key, value) => setPayment((current) => ({ ...current, [key]: value }));

  function correctPurpose() {
    const amountText = `${formatNumber(invoiceAmount)} USD`;
    if (purposeAmount === null) {
      update("purpose", `${payment.purpose.trim()} ${amountText}`.trim());
      return;
    }
    update("purpose", payment.purpose.replace(/[\d][\d\s.,]*\s*USD/i, amountText));
  }

  return (
    <div className="step-content payment-content">
      <SectionTitle
        title="Проверьте платёж"
        description="Реквизиты заполнены из договора. Сверьте их с инвойсом и правилами вашей компании."
      />

      {analysis && <div className="missing-notice" role="status">
        <span className="missing-notice-icon"><Sparkles size={17} /></span>
        <div>
          <strong>Проверка документов: {analysis.metrics.autoFilledCount} полей предложено, {analysis.metrics.blockingCount} критичных расхождений</strong>
          {analysis.issues.map((item) => <p key={item.code}>{item.message} {item.nextStep}</p>)}
          <p>Это подсказки для черновика. Проверьте каждое значение самостоятельно.</p>
        </div>
      </div>}
      {amountDiffers && <div className="ai-stop" role="alert"><strong>Сумма перевода отличается от инвойса.</strong><p>По демо-инвойсу указано {formatNumber(invoiceAmount)} USD. Проверьте введённую сумму.</p></div>}

      <div className="form-grid payment-grid">
        <Field id="debit-account" label="Счёт списания" required>
          <Select id="debit-account" value={payment.debitAccount} onChange={(event) => update("debitAccount", event.target.value)}>
            <option>KZ14998CTB0000012847 — USD</option>
            <option>KZ14998CTB0000012847 — KZT</option>
            <option>KZ62998CTB0000016510 — EUR</option>
          </Select>
        </Field>
        <Field id="payment-amount" label="Сумма перевода" required hint="По инвойсу INV-284: 48 500 USD">
          <div className="input-combo">
            <Input id="payment-amount" value={payment.amount} onChange={(event) => update("amount", event.target.value)} inputMode="decimal" />
            <span className="currency-suffix">USD</span>
          </div>
        </Field>
        <Field id="value-date" label="Дата валютирования" required hint="Ожидаемая дата зачисления средств получателю.">
          <Input id="value-date" type="date" value={payment.valueDate} onChange={(event) => update("valueDate", event.target.value)} />
        </Field>
        <div className="field field-span-2 urgency-control">
          <Toggle
            checked={payment.urgent}
            onChange={(value) => update("urgent", value)}
            label="Срочный перевод"
            description="Дополнительная комиссия — 5 000 ₸. Банк обработает платёж быстрее в рабочий день."
          />
        </div>

        <Field id="recipient-swift" label="SWIFT банка получателя" required>
          <Input id="recipient-swift" value={payment.swift} onChange={(event) => update("swift", event.target.value)} />
        </Field>
        <Field id="intermediary-bank" label="Банк-посредник" hint="Если указан в инвойсе или реквизитах банка.">
          <Input id="intermediary-bank" value={payment.intermediary} onChange={(event) => update("intermediary", event.target.value)} placeholder="Необязательно" />
        </Field>
        <Field id="knp" label="КНП" required hint="Код назначения платежа.">
          <Select id="knp" value={payment.knp} onChange={(event) => update("knp", event.target.value)}>
            <option value="710">710 — Оплата за товар</option>
            <option value="720">720 — Оплата за услуги</option>
            <option value="859">859 — Прочие переводы</option>
          </Select>
        </Field>
        <Field id="payment-purpose" label="Назначение перевода" required className="field-span-2" hint="Укажите номер инвойса и назначение так, как они приведены в документе.">
          <Textarea id="payment-purpose" value={payment.purpose} onChange={(event) => update("purpose", event.target.value)} rows={3} />
        </Field>
        {mismatch && (
          <div className="ai-stop field-span-2" role="alert">
            <div className="ai-stop-heading"><span className="ai-stop-icon"><CircleHelp size={17} /></span><strong>Я остановился — суммы не совпадают</strong></div>
            <p>В назначении указано {purposeAmount === null ? "не указана сумма в USD" : `${formatNumber(purposeAmount)} USD`}, а в инвойсе INV-284 — 48 500 USD. Я не буду менять данные за вас. Сверьте инвойс и выберите, что исправить.</p>
            <Button variant="secondary" className="fix-purpose-button" onClick={correctPurpose}>Исправить назначение на сумму инвойса</Button>
          </div>
        )}
        <Field id="basis-document" label="Номер и дата документа-основания" required className="field-span-2">
          <Input id="basis-document" value={payment.document} onChange={(event) => update("document", event.target.value)} />
        </Field>
        <Field id="recipient-name" label="Наименование получателя" required>
          <Input id="recipient-name" value={payment.recipient} onChange={(event) => update("recipient", event.target.value)} />
        </Field>
        <Field id="residence-country" label="Страна резидентства" required>
          <Select id="residence-country" value={payment.residence} onChange={(event) => update("residence", event.target.value)}>
            <option>Китай</option><option>Германия</option><option>Турция</option><option>ОАЭ</option>
          </Select>
        </Field>
        <Field id="recipient-iban" label="Счёт получателя (IBAN)" required>
          <Input id="recipient-iban" value={payment.iban} onChange={(event) => update("iban", event.target.value)} />
        </Field>
        <Field id="kbe" label="КБе" required hint="Код бенефициара по справочнику банка.">
          <Input id="kbe" value={payment.kbe} onChange={(event) => update("kbe", event.target.value)} inputMode="numeric" />
        </Field>
        <Field id="recipient-country" label="Страна получателя" required>
          <Select id="recipient-country" value={payment.country} onChange={(event) => update("country", event.target.value)}>
            <option>Китай</option><option>Германия</option><option>Турция</option><option>ОАЭ</option>
          </Select>
        </Field>
        <Field id="address-type" label="Тип адреса" required>
          <Select id="address-type" value={payment.addressType} onChange={(event) => update("addressType", event.target.value)}>
            <option>Юридический адрес</option><option>Фактический адрес</option>
          </Select>
        </Field>
        <Field id="fee-type" label="Тип комиссии" required hint="OUR — все комиссии платит отправитель. BEN — получатель. SHA — каждый платит своему банку.">
          <Select id="fee-type" value={payment.feeType} onChange={(event) => update("feeType", event.target.value)}>
            <option value="OUR">OUR — плачу я</option><option value="BEN">BEN — платит получатель</option><option value="SHA">SHA — делим расходы</option>
          </Select>
        </Field>
        <Field id="fee-account" label="Счёт списания комиссии" required>
          <Select id="fee-account" value={payment.feeAccount} onChange={(event) => update("feeAccount", event.target.value)}>
            <option>KZ14998CTB0000012847 — USD</option>
            <option>KZ14998CTB0000012847 — KZT</option>
            <option>KZ62998CTB0000016510 — EUR</option>
          </Select>
        </Field>
        <div className="field field-span-2">
          <span className="field-label">Подписанты</span>
          <div className="signer-options">
            <Checkbox checked={signers.director} onChange={(value) => setSigners((current) => ({ ...current, director: value }))}>Руководитель</Checkbox>
            <Checkbox checked={signers.accountant} onChange={(value) => setSigners((current) => ({ ...current, accountant: value }))}>Главный бухгалтер</Checkbox>
          </div>
          {(!signers.director || !signers.accountant) && <p className="field-hint">Для этого платежа выберите обоих подписантов.</p>}
        </div>
        <div className="field field-span-2 consent-block">
          <Checkbox checked={consent} onChange={setConsent}>
            Я проверил реквизиты и согласен с условиями валютного перевода.
          </Checkbox>
          <p className="consent-note"><LockKeyhole size={14} /> Перевод подпишут уполномоченные сотрудники компании. Помощник не подписывает документы.</p>
        </div>
      </div>

      <div className="demo-disclosure"><ShieldCheck size={16} /><span>Это прототип: нажатие «Отправить на проверку» покажет демо-статус. Данные не передаются в банк.</span></div>
      <div className="payment-submit-row">
        {mismatch ? <span className="submit-hint">Сначала подтвердите правильную сумму в назначении.</span> : !consent ? <span className="submit-hint">Для продолжения подтвердите условия перевода.</span> : <span className="submit-hint">Финальное решение и подпись остаются за вами.</span>}
        <Button onClick={onSubmit} disabled={mismatch || amountDiffers || Boolean(analysis?.metrics.blockingCount) || !consent || !signers.director || !signers.accountant}>Отправить на проверку</Button>
      </div>
    </div>
  );
}

function StatusStep({ application, payment, contractData, contractNumber, onBackToPayment, onStartOver }) {
  return (
    <div className="step-content status-content">
      <div className="status-heading">
        <span className="status-check"><Check size={23} /></span>
        <div>
          <h2>Пакет подготовлен к проверке</h2>
          <p>В демо-сценарии все данные собраны и переданы на внутреннюю проверку.</p>
        </div>
      </div>

      <div className="status-disclosure" role="note">
        <ShieldCheck size={19} />
        <p><strong>AI ничего не подписывает и не отправляет сам.</strong> Здесь показан пример статуса: в прототипе нет подключения к банку. В BCC Business финальное решение и подписание остаются за вами и вашими подписантами.</p>
      </div>

      <div className="status-columns">
        <section className="status-section">
          <h3>Что вошло в пакет</h3>
          <ul className="status-list">
            <li><CheckCircle2 size={17} /><span><strong>Валютный договор</strong><small>№ {contractNumber} — {contractData.amount ? `${formatNumber(contractData.amount)} ${contractData.currency}` : "сумма не указана"}</small></span><em>Подготовлен</em></li>
            <li><CheckCircle2 size={17} /><span><strong>Заявление</strong><small>{application.number} — {application.date ? new Date(`${application.date}T12:00:00`).toLocaleDateString("ru-RU") : "дата не указана"}</small></span><em>Подготовлено</em></li>
            <li><CheckCircle2 size={17} /><span><strong>Документ-основание</strong><small>{application.fileName || "Подтверждающий документ"}</small></span><em>Приложен</em></li>
          </ul>
        </section>
        <section className="status-section review-section">
          <h3>Что проверяется</h3>
          <ul className="review-list">
            <li><span className="review-dot" /><span>Реквизиты получателя и банка</span><span className="review-state">На проверке</span></li>
            <li><span className="review-dot" /><span>Назначение и сумма инвойса</span><span className="review-state">Сверено вами</span></li>
            <li><span className="review-dot" /><span>Условия договора и заявления</span><span className="review-state">На проверке</span></li>
          </ul>
        </section>
      </div>

      <section className="ai-decisions">
        <h3>Что предложил AI и что подтвердили вы</h3>
        <div className="decision-row"><span className="decision-label">AI предложил</span><span>Реквизиты контрагента из договора и КНП из назначения платежа.</span></div>
        <div className="decision-row"><span className="decision-label">Вы проверили</span><span>Исправили сумму в назначении на 48 500 USD, сверили её с инвойсом и подтвердили условия.</span></div>
      </section>

      <div className="next-step">
        <span className="next-step-number">Следующий шаг</span>
        <strong>Подпишите платёж в BCC Business</strong>
        <p>Руководитель и главный бухгалтер подтверждают платёж своими ключами. После подписания банк начнёт проверку документов.</p>
      </div>

      <div className="status-actions">
        <Button variant="secondary" onClick={onBackToPayment}>Вернуться к платёжным данным</Button>
        <Button variant="quiet" onClick={onStartOver}>Подготовить новый перевод</Button>
      </div>
    </div>
  );
}

function Aside({ step, contractNumber, payment, application }) {
  const isStatus = step === 4;
  return (
    <aside className="side-column">
      {!isStatus ? (
        <>
          <section className="summary-panel">
            <div className="aside-heading">
              <h2>Сводка перевода</h2>
              <span className="aside-subtitle">Обновляется по мере заполнения</span>
            </div>
            <div className="summary-amount">
              <span>Сумма перевода</span>
              <strong>{formatNumber(payment.amount)} <small>USD</small></strong>
            </div>
            <dl className="summary-details">
              <div><dt>Получатель</dt><dd>{payment.recipient || "Не указан"}</dd></div>
              <div><dt>Страна</dt><dd>{payment.country}</dd></div>
              <div><dt>Валютный договор</dt><dd>{contractNumber || "Не указан"}</dd></div>
              <div><dt>Инвойс</dt><dd>{application.number || "Не указан"}</dd></div>
              <div><dt>Тип комиссии</dt><dd>{payment.feeType}</dd></div>
              {payment.urgent && <div><dt>Срочный перевод</dt><dd>Доплата 5 000 ₸</dd></div>}
            </dl>
            <div className="summary-note"><Building2 size={15} /><span>Списание со счёта компании в BCC Business</span></div>
          </section>

          <section className="help-panel">
            <div className="help-title"><ShieldCheck size={18} /><h2>{step === 3 ? "Ваш контроль" : "Как помогает AI"}</h2></div>
            {step === 1 ? (
              <p>Помощник переносит условия договора в форму. Сверьте каждое отмеченное значение с оригиналом.</p>
            ) : step === 2 ? (
              <p>Инвойс свяжет заявление с суммой и назначением будущего платежа. Без подтверждающего документа перейти дальше не получится.</p>
            ) : (
              <p>AI проверяет совпадения и подсказывает, где остановиться. Подписание и отправка возможны только после вашего подтверждения.</p>
            )}
            <div className="help-rule"><LockKeyhole size={14} /><span>Решение остаётся за вами</span></div>
          </section>
        </>
      ) : (
        <>
          <section className="next-panel">
            <div className="next-panel-icon"><FileCheck2 size={19} /></div>
            <h2>Пакет готов</h2>
            <p>Все три шага подготовки пройдены. Платёж ожидает подписи уполномоченных сотрудников.</p>
            <div className="next-panel-row"><span>Договор</span><strong>{contractNumber || "ВЭД-2026-041"}</strong></div>
            <div className="next-panel-row"><span>К получению</span><strong>{formatNumber(payment.amount)} USD</strong></div>
          </section>
          <section className="help-panel">
            <div className="help-title"><CircleHelp size={18} /><h2>Ваш следующий шаг</h2></div>
            <p>Откройте платёж в BCC Business и подтвердите его электронной подписью. Если что-то нужно изменить, вернитесь к форме.</p>
            <div className="help-rule"><LockKeyhole size={14} /><span>Без подписи банк не получит платёж</span></div>
          </section>
        </>
      )}
    </aside>
  );
}

function App() {
  const [step, setStep] = useState(1);
  const [contractSource, setContractSource] = useState("existing");
  const [selectedContract, setSelectedContract] = useState(contracts[0]);
  const [contractData, setContractData] = useState({ ...initialContract });
  const [contractNumber, setContractNumber] = useState(contracts[0].number);
  const [contractFile, setContractFile] = useState("");
  const [application, setApplication] = useState({
    number: "INV-284",
    date: "2026-11-06",
    linked: true,
    fileName: "",
  });
  const [payment, setPayment] = useState({ ...initialPayment });
  const [signers, setSigners] = useState({ director: true, accountant: true });
  const [consent, setConsent] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const amountMismatch = useMemo(() => extractPurposeAmount(payment.purpose) !== invoiceAmount, [payment.purpose]);
  const canContinueFromContract = Boolean(contractNumber.trim() && contractData.counterparty.trim() && contractData.amount.trim());
  const canContinueFromApplication = Boolean(application.number.trim() && application.date && application.fileName);

  useEffect(() => {
    if (step !== 3) return;
    const controller = new AbortController();
    const payload = {
      contract: { number: contractNumber, seller: contractData.counterparty, currency: contractData.currency, total: Number(contractData.amount), unk: null },
      invoice: { number: application.number, date: application.date, contractNumber, seller: contractData.counterparty,
        currency: "USD", amount: invoiceAmount, beneficiaryName: payment.recipient, beneficiaryIban: payment.iban,
        beneficiarySwift: payment.swift, beneficiaryCountry: "CN", commission: payment.feeType,
        description: "промышленное оборудование" },
      edits: { amount: Number(payment.amount), beneficiaryIban: payment.iban, beneficiarySwift: payment.swift }
    };
    fetch("http://127.0.0.1:3001/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Проверка недоступна")))
      .then(setAnalysis)
      .catch(() => { if (!controller.signal.aborted) setAnalysis(null); });
    return () => controller.abort();
  }, [step, contractNumber, contractData.counterparty, contractData.currency, contractData.amount, application.number, application.date,
    payment.recipient, payment.iban, payment.swift, payment.feeType, payment.amount]);

  function startOver() {
    setStep(1);
    setContractSource("existing");
    setSelectedContract(contracts[0]);
    setContractData({ ...initialContract });
    setContractNumber(contracts[0].number);
    setContractFile("");
    setApplication({ number: "INV-284", date: "2026-11-06", linked: true, fileName: "" });
    setPayment({ ...initialPayment });
    setSigners({ director: true, accountant: true });
    setConsent(false);
  }

  return (
    <div className="app-shell min-h-screen bg-canvas font-sans text-ink">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">bcc</span>
          <span className="brand-divider" />
          <span className="brand-name">BCC Business</span>
        </div>
        <div className="topbar-right">
          <span className="autosave"><CheckCircle2 size={15} /> Черновик сохранён</span>
          <div className="company-menu">
            <span className="company-avatar">О</span>
            <span className="company-name">ТОО «Orda Export»</span>
            <ChevronDown size={15} />
          </div>
        </div>
      </header>

      <main className="page-main">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">Платежи <span>/</span> Валютные переводы</div>
            <h1>{step === 4 ? "Статус валютного перевода" : "Подготовка валютного перевода"}</h1>
            <p>Проверьте договор, подготовьте заявление и платёж. Все решения остаются за вами.</p>
          </div>
          <span className="demo-badge"><span /> Демо-сценарий</span>
        </div>

        <ProgressStepper current={step} onGoTo={setStep} />

        <div className="workspace-grid">
          <section className="main-panel" aria-label={`Шаг ${step}: ${steps[step - 1]}`}>
            {step === 1 && (
              <ContractStep
                contractSource={contractSource}
                setContractSource={setContractSource}
                contractData={contractData}
                setContractData={setContractData}
                contractNumber={contractNumber}
                setContractNumber={setContractNumber}
                selectedContract={selectedContract}
                setSelectedContract={setSelectedContract}
                contractFile={contractFile}
                setContractFile={setContractFile}
              />
            )}
            {step === 2 && <ApplicationStep application={application} setApplication={setApplication} />}
            {step === 3 && (
              <PaymentStep
                payment={payment}
                setPayment={setPayment}
                signers={signers}
                setSigners={setSigners}
                consent={consent}
                setConsent={setConsent}
                onSubmit={() => setStep(4)}
                analysis={analysis}
              />
            )}
            {step === 4 && (
              <StatusStep application={application} payment={payment} contractData={contractData} contractNumber={contractNumber} onBackToPayment={() => setStep(3)} onStartOver={startOver} />
            )}

            {step < 4 && (
              <div className="step-navigation">
                <Button variant="quiet" onClick={() => step > 1 && setStep(step - 1)} disabled={step === 1}>Назад</Button>
                {step === 1 && (
                  <Button onClick={() => setStep(2)} disabled={!canContinueFromContract}>К заявлению</Button>
                )}
                {step === 2 && (
                  <div className="navigation-next">
                    {!canContinueFromApplication && <span>Добавьте документ, чтобы продолжить.</span>}
                    <Button onClick={() => setStep(3)} disabled={!canContinueFromApplication}>К платёжным реквизитам</Button>
                  </div>
                )}
              </div>
            )}
          </section>
          <Aside step={step} contractNumber={contractNumber} payment={payment} application={application} />
        </div>
        <footer className="page-footer"><span>Помощник по валютным переводам</span><span>Данные в этом прототипе не передаются в банк</span></footer>
      </main>
    </div>
  );
}

export default App;
