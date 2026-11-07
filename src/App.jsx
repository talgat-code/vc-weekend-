import { useEffect, useRef, useState } from "react";
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
  Upload,
} from "lucide-react";
import { Button, Checkbox, Field, HelpTooltip, Input, SectionTitle, Select, Textarea, Toggle } from "./components/ui.jsx";
import { analyzeDocument, createWorkflow, deleteWorkflowDocument, getSessionToken, normalizeWorkflow, updateWorkflow, validateWorkflow } from "./api/client.js";
import caseFixtures from "../data/cases.json";

const steps = ["Валютный договор", "Заявление", "Платёж", "Статус"];
const defaultCase = caseFixtures[0];

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
  contractDate: defaultCase.contract.date,
  buyerCountry: "Казахстан",
  counterparty: defaultCase.contract.seller,
  sellerCountry: defaultCase.contract.sellerCountry,
  amount: String(defaultCase.contract.total),
  currency: "USD",
  endDate: "31.12.2026",
  subject: defaultCase.contract.subject,
  paymentTerms: defaultCase.contract.paymentTerms,
  deliveryTerms: "",
  registrationNumber: defaultCase.contract.unk || "",
  bank: defaultCase.invoice.beneficiaryBank,
  swift: defaultCase.invoice.beneficiarySwift,
  account: defaultCase.invoice.beneficiaryIban,
};

const initialPayment = {
  debitAccount: "KZ14998CTB0000012847 — USD",
  amount: String(defaultCase.invoice.amount),
  valueDate: "2026-11-10",
  urgent: false,
  swift: defaultCase.invoice.beneficiarySwift,
  intermediary: "",
  knp: "710",
  purpose: `Оплата по инвойсу ${defaultCase.invoice.number}, ${formatNumber(defaultCase.invoice.amount)} USD`,
  document: `${defaultCase.invoice.number} от ${defaultCase.invoice.date}`,
  recipient: defaultCase.invoice.beneficiaryName,
  residence: "Великобритания",
  iban: defaultCase.invoice.beneficiaryIban,
  kbe: "17",
  country: "Великобритания",
  addressType: "Юридический адрес",
  feeType: "SHA",
  feeAccount: "KZ14998CTB0000012847 — USD",
  useBonuses: false,
};

function formatNumber(value) {
  const parsed = Number(String(value).replace(/[\s,]/g, ""));
  return Number.isFinite(parsed) ? new Intl.NumberFormat("ru-RU").format(parsed) : value;
}

function extractPurposeAmount(text, currency = "USD") {
  const escapedCurrency = String(currency || "USD").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(\\d{1,3}(?:[\\s\\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*${escapedCurrency}\\b`, "i"));
  if (!match) return null;
  const amount = Number(match[1].replace(/[\s,]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function extractedValue(record, key, fallback = "") {
  if (!record?.fields || !Object.prototype.hasOwnProperty.call(record.fields, key)) return fallback;
  return record.fields[key]?.value ?? "";
}

function splitDocumentReference(value, fallbackNumber, fallbackDate) {
  const text = String(value || "");
  const match = text.match(/^(.+?)\s+(?:от|from)\s+(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})$/i);
  return { number: match?.[1]?.trim() || fallbackNumber, date: match?.[2] || fallbackDate };
}

function buildWorkflowPayload({ activeCase, invoiceData, contractData, contractNumber, application, payment, signers, consent }) {
  const reference = splitDocumentReference(payment.document, application.number, application.date);
  const supportingDocuments = application.fileName ? [{ name: application.fileName, type: "invoice" }] : [];
  const sourceInvoice = invoiceData ?? activeCase.invoice;
  return {
    mode: "deterministic",
    contract: {
      contract_number: contractNumber,
      contract_date: contractData.contractDate,
      buyer_name: contractData.company,
      buyer_country: contractData.buyerCountry,
      seller_name: contractData.counterparty,
      seller_country: contractData.sellerCountry,
      contract_amount: contractData.amount,
      contract_currency: contractData.currency,
      contract_expiry_date: contractData.endDate,
      beneficiary_bank_name: contractData.bank,
      beneficiary_swift: contractData.swift,
      beneficiary_account: contractData.account,
      contract_registration_number: contractData.registrationNumber || null,
      contract_subject: contractData.subject,
      payment_terms: contractData.paymentTerms,
      delivery_terms: contractData.deliveryTerms,
    },
    application: {
      document_number: application.number,
      document_date: application.date,
      document_type: "invoice",
      supporting_documents: supportingDocuments,
      linked_to_contract: application.linked,
    },
    invoice: {
      invoice_number: application.number || sourceInvoice.number,
      invoice_date: application.date || sourceInvoice.date,
      invoice_amount: String(sourceInvoice.amount ?? ""),
      invoice_currency: sourceInvoice.currency,
      contract_number: sourceInvoice.contractNumber,
      seller_name: sourceInvoice.seller || sourceInvoice.beneficiaryName,
      buyer_name: sourceInvoice.buyer,
      description: sourceInvoice.description,
      beneficiary_bank_name: sourceInvoice.beneficiaryBank,
      beneficiary_name: sourceInvoice.beneficiaryName,
      beneficiary_account: sourceInvoice.beneficiaryIban,
      beneficiary_swift: sourceInvoice.beneficiarySwift,
      beneficiary_country: sourceInvoice.beneficiaryCountry,
    },
    payment: {
      debit_account: payment.debitAccount,
      transfer_amount: payment.amount,
      value_date: payment.valueDate,
      urgent_transfer: payment.urgent,
      beneficiary_bank_swift: payment.swift,
      intermediary_bank: payment.intermediary,
      knp: payment.knp,
      payment_purpose: payment.purpose,
      linked_to_contract: application.linked,
      supporting_document_number: reference.number,
      supporting_document_date: reference.date,
      supporting_documents: supportingDocuments,
      beneficiary_name: payment.recipient,
      beneficiary_residency_country: payment.residence,
      beneficiary_account: payment.iban,
      kbe: payment.kbe,
      beneficiary_address_country: payment.country,
      beneficiary_address_type: payment.addressType,
      commission_type: payment.feeType,
      commission_debit_account: payment.feeAccount,
      director_signatory: signers.director ? "Руководитель" : "",
      chief_accountant_signatory: signers.accountant ? "Главный бухгалтер" : "",
      use_bonuses: payment.useBonuses,
      agreement_accepted: consent,
    },
  };
}

function dirtyFieldsForStage(stage, dirtyFields) {
  const fieldMap = {
    contract: {
      contract_number: "contract.contractNumber", contract_date: "contract.contractDate", buyer_name: "contract.company",
      buyer_country: "contract.buyerCountry", seller_name: "contract.counterparty", seller_country: "contract.sellerCountry",
      contract_amount: "contract.amount", contract_currency: "contract.currency", contract_expiry_date: "contract.endDate",
      contract_subject: "contract.subject", payment_terms: "contract.paymentTerms", delivery_terms: "contract.deliveryTerms",
      beneficiary_bank_name: "contract.bank", beneficiary_swift: "contract.swift", beneficiary_account: "contract.account",
      contract_registration_number: "contract.registrationNumber",
    },
    application: { document_number: "application.number", document_date: "application.date", linked_to_contract: "application.linked" },
    invoice: {
      invoice_number: "application.number", invoice_date: "application.date", invoice_amount: "invoice.amount",
      invoice_currency: "invoice.currency", contract_number: "invoice.contractNumber", seller_name: "invoice.seller",
      buyer_name: "invoice.buyer", description: "invoice.description", beneficiary_name: "invoice.beneficiaryName",
      beneficiary_bank_name: "invoice.beneficiaryBank", beneficiary_account: "invoice.beneficiaryIban",
      beneficiary_swift: "invoice.beneficiarySwift",
    },
  };
  return Object.entries(fieldMap[stage] || {}).filter(([, dirtyKey]) => dirtyFields.has(dirtyKey)).map(([field]) => field);
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

function SourceHint({ children = "Из документа, проверьте" }) {
  return <span className="source-hint">{children}</span>;
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
  onAnalyzeFile,
  onRemoveDocument,
  onUserEdit,
  documentState,
  apiState,
}) {
  const fileInput = useRef(null);
  const fromAI = contractSource === "ai";
  const update = (key, value) => {
    onUserEdit?.(`contract.${key}`);
    setContractData((current) => ({ ...current, [key]: value }));
  };

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setContractSource("ai");
    setContractFile(file.name);
    event.target.value = "";
    // Send the selected document to the local AI backend for extraction.
    onAnalyzeFile?.(file, "contract");
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
          accept=".pdf,.docx"
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
      ) : contractFile ? (
        <div className="upload-summary">
          <span className="upload-summary-icon">{documentState?.status === "analyzing" ? <span className="document-spinner" /> : <FileCheck2 size={19} />}</span>
          <span className="upload-summary-copy">
            <strong>{contractFile || "Договор выбран для разбора"}</strong>
            <span>{documentState?.status === "analyzing" ? "AI анализирует договор…" : documentState?.status === "error" ? documentState.error : "Анализ завершён. Сверьте предложенные значения с оригиналом."}</span>
          </span>
          <div className="document-actions">
            <button type="button" className="text-button" onClick={() => fileInput.current?.click()}>Заменить</button>
            <button type="button" className="text-button" onClick={() => onRemoveDocument?.("contract")}>Удалить</button>
          </div>
          {documentState?.status === "analyzed" && <BadgeCheck size={19} className="success-icon" />}
        </div>
      ) : (
        <div className="upload-area document-upload-empty">
          <span className="upload-area-icon"><Upload size={19} /></span>
          <div className="upload-area-copy"><strong>Загрузите валютный договор</strong><span>PDF или DOCX, включая двуязычные документы и таблицы.</span></div>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>Выбрать файл</Button>
        </div>
      )}

      <div className="form-section-heading">
        <div className="heading-with-help"><h3>Данные договора</h3><HelpTooltip text="Здесь собраны реквизиты, которые банк использует для связи платежа с внешнеторговым договором." label="Пояснение: данные договора" /></div>
        <span>Проверьте перед продолжением</span>
      </div>
      <div className="form-grid grid grid-cols-1 sm:grid-cols-2">
        <Field id="contract-number" label="Номер валютного договора" required marker={fromAI ? "Введите вручную" : undefined}>
          <Input id="contract-number" value={contractNumber} onChange={(event) => { onUserEdit?.("contract.contractNumber"); setContractNumber(event.target.value); }} placeholder="Например, ВЭД-2026-041" />
        </Field>
        <Field id="contract-company" label="Сторона в Казахстане" marker={fromAI && <SourceHint />}>
          <Input id="contract-company" value={contractData.company} onChange={(event) => update("company", event.target.value)} />
        </Field>
        <Field id="contract-counterparty" label="Иностранный контрагент" marker={fromAI && <SourceHint />}>
          <Input id="contract-counterparty" value={contractData.counterparty} onChange={(event) => update("counterparty", event.target.value)} />
        </Field>
        <Field id="contract-date" label="Дата договора" marker={fromAI && <SourceHint />}>
          <Input id="contract-date" value={contractData.contractDate} onChange={(event) => update("contractDate", event.target.value)} placeholder="ГГГГ-ММ-ДД" />
        </Field>
        <Field id="contract-countries" label="Страны покупателя и продавца" marker={fromAI && <SourceHint />}>
          <div className="input-combo">
            <Input value={contractData.buyerCountry} onChange={(event) => update("buyerCountry", event.target.value)} aria-label="Страна покупателя" />
            <Input value={contractData.sellerCountry} onChange={(event) => update("sellerCountry", event.target.value)} aria-label="Страна продавца" />
          </div>
        </Field>
        <div className="field">
          <div className="field-heading">
            <span className="field-label-wrap"><label className="field-label" htmlFor="contract-amount">Сумма и валюта</label><HelpTooltip text="Общая сумма договора и валюта расчёта. По ним банк сверит будущий платёж." label="Пояснение: сумма и валюта" /></span>
            {fromAI && <SourceHint />}
          </div>
          <div className="input-combo">
            <Input id="contract-amount" value={contractData.amount} onChange={(event) => update("amount", event.target.value)} inputMode="decimal" />
            <Select aria-label="Валюта договора" value={contractData.currency} onChange={(event) => update("currency", event.target.value)}>
              <option>USD</option><option>EUR</option><option>CNY</option><option>GBP</option>
            </Select>
          </div>
        </div>
        <Field id="contract-expiry" label="Срок действия договора" marker={fromAI && <SourceHint />}>
          <Input id="contract-expiry" value={contractData.endDate} onChange={(event) => update("endDate", event.target.value)} placeholder="ДД.ММ.ГГГГ" />
        </Field>
        <Field id="contract-bank" label="Банк получателя" marker={fromAI && <SourceHint />}>
          <Input id="contract-bank" value={contractData.bank} onChange={(event) => update("bank", event.target.value)} />
        </Field>
        <Field id="contract-swift" label="SWIFT и счёт контрагента" className="field-span-2" marker={fromAI && <SourceHint />}>
          <Input id="contract-swift" value={`${contractData.swift} — ${contractData.account}`} onChange={(event) => {
            const [swift = "", ...account] = event.target.value.split("—");
            update("swift", swift.trim());
            update("account", account.join("—").trim());
          }} />
        </Field>
        <Field id="contract-subject" label="Предмет договора" className="field-span-2" marker={fromAI && <SourceHint />}>
          <Textarea id="contract-subject" value={contractData.subject} onChange={(event) => update("subject", event.target.value)} rows={2} />
        </Field>
        <Field id="contract-payment-terms" label="Условия оплаты" marker={fromAI && <SourceHint />}>
          <Input id="contract-payment-terms" value={contractData.paymentTerms} onChange={(event) => update("paymentTerms", event.target.value)} />
        </Field>
        <Field id="contract-delivery-terms" label="Условия поставки" marker={fromAI && <SourceHint />}>
          <Input id="contract-delivery-terms" value={contractData.deliveryTerms} onChange={(event) => update("deliveryTerms", event.target.value)} />
        </Field>
        <Field id="contract-registration-number" label="УНК" marker={fromAI && <SourceHint />}>
          <Input id="contract-registration-number" value={contractData.registrationNumber} onChange={(event) => update("registrationNumber", event.target.value)} placeholder="Если присвоен" />
        </Field>
      </div>
      {fromAI && !contractNumber && <p className="form-note"><CircleHelp size={15} /> Номер договора не найден в выбранном фрагменте. Введите его так, как он указан в подписанном документе.</p>}
    </div>
  );
}

function ApplicationStep({ application, setApplication, invoiceData, setInvoiceData, onAnalyzeFile, onRemoveDocument, onUserEdit, documentState }) {
  const fileInput = useRef(null);
  const missingFile = !application.fileName;
  const update = (key, value) => {
    onUserEdit?.(`application.${key}`);
    setApplication((current) => ({ ...current, [key]: value }));
  };
  const updateInvoice = (key, value) => {
    onUserEdit?.(`invoice.${key}`);
    setInvoiceData((current) => ({ ...current, [key]: value }));
  };

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (file) {
      update("fileName", file.name);
      onAnalyzeFile?.(file, "invoice");
    }
    event.target.value = "";
  }

  return (
    <div className="step-content">
      <SectionTitle
        title="Подготовьте заявление"
        description="Укажите реквизиты и отдельно загрузите инвойс, который подтверждает сумму и получателя платежа."
      />

      <div className="form-grid grid grid-cols-1 sm:grid-cols-2">
        <Field id="application-number" label="Номер документа" required>
          <Input id="application-number" value={application.number} onChange={(event) => update("number", event.target.value)} />
        </Field>
        <Field id="application-date" label="Дата документа" required>
          <Input id="application-date" type="date" value={application.date} onChange={(event) => update("date", event.target.value)} />
        </Field>
      </div>

      <div className="choice-block">
        <div>
          <div className="block-title-row"><h3 className="choice-title">Заявление связано с валютным договором?</h3><HelpTooltip text="Привязка помогает банку сопоставить заявление и будущий платёж с условиями выбранного договора." label="Пояснение: привязка к договору" /></div>
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
        <div className="heading-with-help"><h3>Инвойс</h3><HelpTooltip text="Инвойс анализируется отдельно от договора, после чего реквизиты двух документов автоматически сверяются." label="Пояснение: инвойс" /></div>
        <span>PDF или DOCX</span>
      </div>
      {missingFile ? (
        <div className="upload-area">
          <span className="upload-area-icon"><Upload size={19} /></span>
          <div className="upload-area-copy">
            <div className="block-title-row"><strong>Загрузите инвойс</strong><HelpTooltip text="Документ нужен, чтобы сверить сумму платежа, стороны и банковские реквизиты с договором." label="Пояснение: загрузка инвойса" /></div>
            <span>Выберите PDF или DOCX. Таблицы и русско-английские версии поддерживаются.</span>
          </div>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>Выбрать файл</Button>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".pdf,.docx" onChange={handleFile} aria-label="Загрузить инвойс" />
        </div>
      ) : (
        <div className="attached-file">
          <span className="attached-file-icon"><FileText size={18} /></span>
          <span className="attached-file-name">{application.fileName}</span>
          <span className="attached-file-status">{documentState?.status === "analyzing" ? <><span className="document-spinner" /> Анализируется</> : documentState?.status === "error" ? "Ошибка анализа" : <><CheckCircle2 size={15} /> Анализ завершён</>}</span>
          <button type="button" className="text-button" onClick={() => fileInput.current?.click()}>Заменить</button>
          <button type="button" className="text-button" onClick={() => onRemoveDocument?.("invoice")}>Удалить</button>
        </div>
      )}
      {!missingFile && (
        <div className="form-grid grid grid-cols-1 sm:grid-cols-2 invoice-fields">
          <Field id="invoice-amount" label="Сумма и валюта инвойса" marker={<SourceHint />}>
            <div className="input-combo">
              <Input id="invoice-amount" value={invoiceData.amount ?? ""} onChange={(event) => updateInvoice("amount", event.target.value)} inputMode="decimal" />
              <Input value={invoiceData.currency ?? ""} onChange={(event) => updateInvoice("currency", event.target.value)} aria-label="Валюта инвойса" />
            </div>
          </Field>
          <Field id="invoice-seller" label="Продавец" marker={<SourceHint />}>
            <Input id="invoice-seller" value={invoiceData.seller ?? ""} onChange={(event) => updateInvoice("seller", event.target.value)} />
          </Field>
          <Field id="invoice-beneficiary" label="Получатель" marker={<SourceHint />}>
            <Input id="invoice-beneficiary" value={invoiceData.beneficiaryName ?? ""} onChange={(event) => updateInvoice("beneficiaryName", event.target.value)} />
          </Field>
          <Field id="invoice-bank" label="Банк получателя" marker={<SourceHint />}>
            <Input id="invoice-bank" value={invoiceData.beneficiaryBank ?? ""} onChange={(event) => updateInvoice("beneficiaryBank", event.target.value)} />
          </Field>
          <Field id="invoice-bank-details" label="SWIFT и счёт" className="field-span-2" marker={<SourceHint />}>
            <Input id="invoice-bank-details" value={`${invoiceData.beneficiarySwift ?? ""} — ${invoiceData.beneficiaryIban ?? ""}`} onChange={(event) => {
              const [swift = "", ...account] = event.target.value.split("—");
              updateInvoice("beneficiarySwift", swift.trim());
              updateInvoice("beneficiaryIban", account.join("—").trim());
            }} />
          </Field>
          <Field id="invoice-description" label="Описание поставки" className="field-span-2" marker={<SourceHint />}>
            <Textarea id="invoice-description" value={invoiceData.description ?? ""} onChange={(event) => updateInvoice("description", event.target.value)} rows={2} />
          </Field>
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

function PaymentStep({ payment, setPayment, signers, setSigners, consent, setConsent, onSubmit, analysis, invoice, onUserEdit }) {
  const invoiceAmount = Number(invoice.amount);
  const purposeAmount = extractPurposeAmount(payment.purpose, invoice.currency);
  const mismatch = purposeAmount !== null && purposeAmount !== invoiceAmount;
  const amountDiffers = Number(payment.amount) !== invoiceAmount;
  const update = (key, value) => {
    onUserEdit?.(`payment.${key}`);
    setPayment((current) => ({ ...current, [key]: value }));
  };

  function correctPurpose() {
    const amountText = `${formatNumber(invoiceAmount)} ${invoice.currency}`;
    if (purposeAmount === null) {
      update("purpose", `${payment.purpose.trim()} ${amountText}`.trim());
      return;
    }
    const escapedCurrency = String(invoice.currency || "USD").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    update("purpose", payment.purpose.replace(new RegExp(`(\\d{1,3}(?:[\\s\\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*${escapedCurrency}\\b`, "i"), amountText));
  }

  return (
    <div className="step-content payment-content">
      <SectionTitle
        title="Проверьте платёж"
        description="Реквизиты заполнены из договора. Сверьте их с инвойсом и правилами вашей компании."
      />

      {analysis && <div className="missing-notice" role="status">
        <span className="missing-notice-icon"><ShieldCheck size={17} /></span>
        <div>
          <strong>Проверка документов: {analysis.metrics.autoFilledCount} полей предложено, {analysis.metrics.blockingCount} критичных расхождений</strong>
          {analysis.issues.map((item) => <p key={`${item.code}-${item.field}`}><span className="issue-code">{item.code}</span> {item.message} {item.nextStep}</p>)}
          <p>Это подсказки для черновика. Проверьте каждое значение самостоятельно.</p>
        </div>
      </div>}
      {amountDiffers && <div className="ai-stop" role="alert"><strong>Сумма перевода отличается от инвойса.</strong><p>В инвойсе указано {formatNumber(invoiceAmount)} {invoice.currency}. Проверьте введённую сумму.</p></div>}

      <div className="form-grid payment-grid grid grid-cols-1 sm:grid-cols-2">
        <Field id="debit-account" label="Счёт списания" required>
          <Select id="debit-account" value={payment.debitAccount} onChange={(event) => update("debitAccount", event.target.value)}>
            <option>KZ14998CTB0000012847 — USD</option>
            <option>KZ14998CTB0000012847 — KZT</option>
            <option>KZ62998CTB0000016510 — EUR</option>
          </Select>
        </Field>
        <Field id="payment-amount" label="Сумма перевода" required hint={`По инвойсу ${invoice.number}: ${formatNumber(invoiceAmount)} ${invoice.currency}`}>
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
            <span className="issue-code">PAYMENT_PURPOSE_AMOUNT_MISMATCH</span>
            <p>В назначении указано {purposeAmount === null ? "не указана сумма в USD" : `${formatNumber(purposeAmount)} USD`}, а в инвойсе {invoice.number} — {formatNumber(invoiceAmount)} {invoice.currency}. Я не буду менять данные за вас. Сверьте инвойс и выберите, что исправить.</p>
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
            <option>Великобритания</option><option>Китай</option><option>Германия</option><option>Турция</option><option>ОАЭ</option>
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
            <option>Великобритания</option><option>Китай</option><option>Германия</option><option>Турция</option><option>ОАЭ</option>
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
        <div className="field field-span-2 urgency-control">
          <Toggle
            checked={payment.useBonuses}
            onChange={(value) => update("useBonuses", value)}
            label="Потратить бонусы"
            description="Демо-параметр: правила и размер покрытия комиссии в реальном продукте определяет банк."
          />
        </div>
        <div className="field field-span-2">
          <div className="heading-with-help"><span className="field-label">Подписанты</span><HelpTooltip text="Выберите сотрудников, которые будут подтверждать платёж электронной подписью в BCC Business." label="Пояснение: подписанты" /></div>
          <div className="signer-options">
            <Checkbox checked={signers.director} onChange={(value) => setSigners((current) => ({ ...current, director: value }))}>Руководитель</Checkbox>
            <Checkbox checked={signers.accountant} onChange={(value) => setSigners((current) => ({ ...current, accountant: value }))}>Главный бухгалтер</Checkbox>
          </div>
          {(!signers.director || !signers.accountant) && <p className="field-hint">Для этого платежа выберите обоих подписантов.</p>}
        </div>
        <div className="field field-span-2 consent-block">
          <div className="heading-with-help"><span className="field-label">Согласие с условиями</span><HelpTooltip text="Подтверждая условия, вы говорите банку, что проверили реквизиты. Помощник не подписывает и не отправляет платёж вместо вас." label="Пояснение: согласие с условиями" /></div>
          <Checkbox checked={consent} onChange={setConsent}>
            Я проверил реквизиты и согласен с условиями валютного перевода.
          </Checkbox>
          <p className="consent-note"><LockKeyhole size={14} /> Перевод подпишут уполномоченные сотрудники компании. Помощник не подписывает документы.</p>
        </div>
      </div>

      <div className="draft-disclosure"><ShieldCheck size={16} /><span>Платёж сохранится как черновик. Перед отправкой банк потребует подписи уполномоченных сотрудников.</span><HelpTooltip text="Помощник проверяет документы и готовит черновик, но не подписывает и не отправляет платёж вместо вас." label="Пояснение: контроль пользователя" /></div>
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
          <p>Документы собраны в один пакет и готовы к проверке в BCC Business.</p>
        </div>
      </div>

      <div className="status-disclosure" role="note">
        <ShieldCheck size={19} />
        <p><strong>Помощник ничего не подписывает и не отправляет сам.</strong> Пакет подготовлен как черновик: финальное решение и подписание остаются за вами и вашими подписантами.</p>
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
        <div className="decision-row"><span className="decision-label">Вы проверили</span><span>Сверили назначение и сумму с инвойсом, затем подтвердили условия перевода.</span></div>
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

function ReadinessPanel({ contractNumber, contractData, payment, application, consent, analysis }) {
  const checks = [
    { label: "Договор", done: Boolean(contractNumber && contractData.counterparty && contractData.amount) },
    { label: "Документ-основание", done: Boolean(application.number && application.date && application.fileName) },
    { label: "Реквизиты платежа", done: Boolean(payment.amount && payment.swift && payment.iban && payment.purpose) },
    { label: "Проверка и согласие", done: Boolean(analysis && !analysis.metrics.blockingCount && consent) },
  ];
  const completed = checks.filter((item) => item.done).length;
  const score = Math.round((completed / checks.length) * 100);
  const next = checks.find((item) => !item.done)?.label || "Можно отправлять на проверку";

  return (
    <section className="readiness-panel" aria-label="Готовность платежа">
      <div className="readiness-heading">
        <div>
          <h2>Готовность платежа</h2>
          <p>Контрольная карта перед подписью</p>
        </div>
        <strong>{score}%</strong>
      </div>
      <div className="readiness-track" aria-hidden="true"><span style={{ width: `${score}%` }} /></div>
      <ol className="readiness-list">
        {checks.map((item, index) => (
          <li key={item.label} className={item.done ? "is-done" : ""}>
            <span className="readiness-marker">{item.done ? <Check size={12} /> : index + 1}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ol>
      <p className="readiness-next"><span>Следующее действие</span><strong>{next}</strong></p>
    </section>
  );
}

function Aside({ step, contractNumber, contractData, payment, application, consent, analysis }) {
  const isStatus = step === 4;
  return (
    <aside className="side-column grid grid-cols-1">
      {!isStatus ? (
        <>
          <ReadinessPanel contractNumber={contractNumber} contractData={contractData} payment={payment} application={application} consent={consent} analysis={analysis} />
          <section className="summary-panel">
            <div className="aside-heading">
              <div className="heading-with-help"><h2>Сводка перевода</h2><HelpTooltip text="Здесь собраны ключевые реквизиты текущего перевода. Сводка обновляется, пока вы заполняете форму." label="Пояснение: сводка перевода" /></div>
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
            <div className="help-title"><ShieldCheck size={18} /><h2>{step === 3 ? "Ваш контроль" : "Проверка данных"}</h2><HelpTooltip text={step === 3 ? "Помощник подсвечивает несоответствия, но не принимает решение и не подписывает платёж." : "Поля переносятся из документов, а вы проверяете каждое значение перед продолжением."} label="Пояснение: проверка данных" /></div>
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
            <div className="help-title"><CircleHelp size={18} /><h2>Ваш следующий шаг</h2><HelpTooltip text="После подготовки пакета подпишите платёж в BCC Business. Без подписи банк не получит его на проверку." label="Пояснение: следующий шаг" /></div>
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
  const [contractSource, setContractSource] = useState("ai");
  const [selectedContract, setSelectedContract] = useState(contracts[0]);
  const [contractData, setContractData] = useState({ ...initialContract });
  const [contractNumber, setContractNumber] = useState(defaultCase.contract.number);
  const [invoiceData, setInvoiceData] = useState({ ...defaultCase.invoice });
  const [contractFile, setContractFile] = useState("Контракт ВЭД-2026-041.docx");
  const [application, setApplication] = useState({
    number: defaultCase.invoice.number,
    date: defaultCase.invoice.date,
    linked: true,
    fileName: "Инвойс INV-2026-041.pdf",
  });
  const [payment, setPayment] = useState({ ...initialPayment });
  const [signers, setSigners] = useState({ director: true, accountant: true });
  const [consent, setConsent] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [workflowId, setWorkflowId] = useState(null);
  const workflowIdRef = useRef(null);
  const dirtyFields = useRef(new Set());
  const uploadQueue = useRef(Promise.resolve());
  const uploadControllers = useRef({ contract: null, invoice: null });
  const uploadVersions = useRef({ contract: 0, invoice: 0 });
  const [documentStates, setDocumentStates] = useState({
    contract: { file: null, status: "analyzed", error: null },
    invoice: { file: null, status: "analyzed", error: null },
  });
  const [apiState, setApiState] = useState({ connected: false, error: null });
  const activeCase = defaultCase;
  const canContinueFromContract = Boolean(contractNumber.trim() && contractData.counterparty.trim() && contractData.amount.trim());
  const canContinueFromApplication = Boolean(application.number.trim() && application.date && application.fileName);

  function markUserEdit(field) {
    dirtyFields.current.add(field);
  }

  function extractedUnlessEdited(record, field, current, dirtyKey) {
    if (dirtyFields.current.has(dirtyKey)) return current;
    return extractedValue(record, field, current);
  }

  useEffect(() => {
    getSessionToken()
      .then(() => setApiState({ connected: true, error: null }))
      .catch((error) => setApiState({ connected: false, error: error.message }));
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const payload = buildWorkflowPayload({ activeCase, invoiceData, contractData, contractNumber, application, payment, signers, consent });
        let currentId = workflowId;
        let workflow;
        if (!currentId) {
          workflow = await createWorkflow(payload, controller.signal);
          currentId = workflow.analysis_id;
          setWorkflowId(currentId);
          workflowIdRef.current = currentId;
        }
        // A document upload can create the workflow before the user reaches payment.
        // Reconcile every local stage here so the backend always validates the same
        // contract, application, invoice, and payment values that are visible in UI.
        for (const [stage, fields] of Object.entries({
          contract: payload.contract,
          application: payload.application,
          invoice: payload.invoice,
        })) {
          await updateWorkflow(currentId, {
            step: stage,
            fields,
            confirm_fields: dirtyFieldsForStage(stage, dirtyFields.current),
            actor: "user",
          }, controller.signal);
        }
        const patched = await updateWorkflow(currentId, {
          step: "payment",
          fields: payload.payment,
          confirm_fields: [],
          actor: "user",
        }, controller.signal);
        const validated = await validateWorkflow(currentId, controller.signal);
        if (controller.signal.aborted) return;
        setAnalysis(normalizeWorkflow(validated || patched || workflow));
        setApiState({ connected: true, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        // Keep the existing local API as a fallback while the Python service is starting.
        const legacyPayload = {
          contract: { ...activeCase.contract, number: contractNumber, seller: contractData.counterparty, currency: contractData.currency, total: Number(contractData.amount), unk: null },
          invoice: { ...activeCase.invoice, number: application.number, date: application.date, contractNumber, seller: contractData.counterparty,
            amount: activeCase.invoice.amount, beneficiaryName: payment.recipient, beneficiaryIban: payment.iban,
            beneficiarySwift: payment.swift, commission: payment.feeType },
          edits: { amount: Number(payment.amount), beneficiaryIban: payment.iban, beneficiarySwift: payment.swift }
        };
        try {
          const response = await fetch("http://127.0.0.1:3001/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(legacyPayload), signal: controller.signal });
          if (!response.ok) throw new Error("Проверка недоступна");
          setAnalysis(await response.json());
          setApiState({ connected: false, error: error.message });
        } catch {
          setAnalysis(null);
          setApiState({ connected: false, error: error.message });
        }
      }
    }, 260);
    return () => controller.abort();
  }, [step, activeCase, invoiceData, contractNumber, contractData.company, contractData.contractDate, contractData.buyerCountry,
    contractData.counterparty, contractData.sellerCountry, contractData.currency, contractData.amount, contractData.endDate,
    contractData.subject, contractData.paymentTerms, contractData.deliveryTerms, contractData.registrationNumber,
    contractData.bank, contractData.swift, contractData.account, application.number, application.date, application.linked,
    application.fileName, payment.recipient, payment.iban, payment.swift, payment.feeType, payment.amount, payment.purpose, payment.debitAccount,
    payment.valueDate, payment.urgent, payment.intermediary, payment.knp, payment.document, payment.residence, payment.kbe, payment.country,
    payment.addressType, payment.feeAccount, payment.useBonuses, signers.director, signers.accountant, consent]);

  async function handleAnalyzeFile(file, documentType) {
    uploadControllers.current[documentType]?.abort();
    const controller = new AbortController();
    uploadControllers.current[documentType] = controller;
    const version = ++uploadVersions.current[documentType];
    setDocumentStates((current) => ({ ...current, [documentType]: { file, status: "analyzing", error: null } }));
    try {
      const queued = uploadQueue.current.catch(() => null).then(async () => {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const result = await analyzeDocument(file, documentType, workflowIdRef.current, controller.signal);
        workflowIdRef.current = result.analysis_id;
        return result;
      });
      uploadQueue.current = queued;
      const workflow = await queued;
      if (version !== uploadVersions.current[documentType]) return;
      setWorkflowId(workflow.analysis_id);
      setAnalysis(normalizeWorkflow(workflow));
      setApiState({ connected: true, error: null });
      setDocumentStates((current) => ({ ...current, [documentType]: { file, status: "analyzed", error: null } }));
      if (documentType === "contract") {
        const fields = workflow.contract?.fields || {};
        setContractNumber((current) => extractedUnlessEdited(workflow.contract, "contract_number", current, "contract.contractNumber"));
        setContractData((current) => ({
          ...current,
          company: extractedUnlessEdited(workflow.contract, "buyer_name", current.company, "contract.company"),
          contractDate: extractedUnlessEdited(workflow.contract, "contract_date", current.contractDate, "contract.contractDate"),
          buyerCountry: extractedUnlessEdited(workflow.contract, "buyer_country", current.buyerCountry, "contract.buyerCountry"),
          counterparty: extractedUnlessEdited(workflow.contract, "seller_name", current.counterparty, "contract.counterparty"),
          sellerCountry: extractedUnlessEdited(workflow.contract, "seller_country", current.sellerCountry, "contract.sellerCountry"),
          amount: extractedUnlessEdited(workflow.contract, "contract_amount", current.amount, "contract.amount"),
          currency: extractedUnlessEdited(workflow.contract, "contract_currency", current.currency, "contract.currency"),
          endDate: extractedUnlessEdited(workflow.contract, "contract_expiry_date", current.endDate, "contract.endDate"),
          subject: extractedUnlessEdited(workflow.contract, "contract_subject", current.subject, "contract.subject"),
          paymentTerms: extractedUnlessEdited(workflow.contract, "payment_terms", current.paymentTerms, "contract.paymentTerms"),
          deliveryTerms: extractedUnlessEdited(workflow.contract, "delivery_terms", current.deliveryTerms, "contract.deliveryTerms"),
          registrationNumber: extractedUnlessEdited(workflow.contract, "contract_registration_number", current.registrationNumber, "contract.registrationNumber"),
          bank: extractedUnlessEdited(workflow.contract, "beneficiary_bank_name", current.bank, "contract.bank"),
          swift: extractedUnlessEdited(workflow.contract, "beneficiary_swift", current.swift, "contract.swift"),
          account: extractedUnlessEdited(workflow.contract, "beneficiary_account", current.account, "contract.account"),
        }));
        if (!Object.keys(fields).length) setApiState({ connected: true, error: "В документе не нашлось полей для автозаполнения." });
      } else {
        const invoice = workflow.invoice;
        setInvoiceData((current) => ({
          ...current,
          number: extractedUnlessEdited(invoice, "invoice_number", current.number, "application.number"),
          date: extractedUnlessEdited(invoice, "invoice_date", current.date, "application.date"),
          contractNumber: extractedUnlessEdited(invoice, "contract_number", current.contractNumber, "invoice.contractNumber"),
          amount: extractedUnlessEdited(invoice, "invoice_amount", current.amount, "invoice.amount"),
          currency: extractedUnlessEdited(invoice, "invoice_currency", current.currency, "invoice.currency"),
          seller: extractedUnlessEdited(invoice, "seller_name", current.seller, "invoice.seller"),
          buyer: extractedUnlessEdited(invoice, "buyer_name", current.buyer, "invoice.buyer"),
          description: extractedUnlessEdited(invoice, "description", current.description, "invoice.description"),
          beneficiaryName: extractedUnlessEdited(invoice, "beneficiary_name", current.beneficiaryName, "invoice.beneficiaryName"),
          beneficiaryBank: extractedUnlessEdited(invoice, "beneficiary_bank_name", current.beneficiaryBank, "invoice.beneficiaryBank"),
          beneficiaryIban: extractedUnlessEdited(invoice, "beneficiary_account", current.beneficiaryIban, "invoice.beneficiaryIban"),
          beneficiarySwift: extractedUnlessEdited(invoice, "beneficiary_swift", current.beneficiarySwift, "invoice.beneficiarySwift"),
        }));
        setApplication((current) => ({
          ...current,
          number: extractedUnlessEdited(invoice, "invoice_number", current.number, "application.number"),
          date: extractedUnlessEdited(invoice, "invoice_date", current.date, "application.date"),
          fileName: file.name,
        }));
        setPayment((current) => ({
          ...current,
          amount: extractedUnlessEdited(invoice, "invoice_amount", current.amount, "payment.amount"),
          recipient: extractedUnlessEdited(invoice, "beneficiary_name", current.recipient, "payment.recipient"),
          iban: extractedUnlessEdited(invoice, "beneficiary_account", current.iban, "payment.iban"),
          swift: extractedUnlessEdited(invoice, "beneficiary_swift", current.swift, "payment.swift"),
        }));
        await updateWorkflow(workflow.analysis_id, {
          step: "application",
          fields: { supporting_documents: [{ name: file.name, type: "invoice" }], document_type: "invoice" },
          confirm_fields: [],
          actor: "user",
        });
      }
    } catch (error) {
      if (controller.signal.aborted || version !== uploadVersions.current[documentType]) return;
      setApiState({ connected: false, error: error.message });
      setDocumentStates((current) => ({ ...current, [documentType]: { file, status: "error", error: error.message } }));
    }
  }

  async function handleRemoveDocument(documentType) {
    if (documentType === "contract") setContractFile("");
    if (documentType === "invoice") setApplication((current) => ({ ...current, fileName: "" }));
    setDocumentStates((current) => ({ ...current, [documentType]: { file: null, status: "idle", error: null } }));
    if (!workflowIdRef.current) return;
    try {
      const workflow = await deleteWorkflowDocument(workflowIdRef.current, documentType);
      setAnalysis(normalizeWorkflow(workflow));
    } catch (error) {
      setApiState({ connected: false, error: error.message });
    }
  }

  function startOver() {
    setStep(1);
    setContractSource("ai");
    setSelectedContract(contracts[0]);
    setContractData({ ...initialContract });
    setContractNumber(defaultCase.contract.number);
    setInvoiceData({ ...defaultCase.invoice });
    setContractFile("Контракт ВЭД-2026-041.docx");
    setApplication({ number: defaultCase.invoice.number, date: defaultCase.invoice.date, linked: true, fileName: "Инвойс INV-2026-041.pdf" });
    setPayment({ ...initialPayment });
    setSigners({ director: true, accountant: true });
    setConsent(false);
    setWorkflowId(null);
    workflowIdRef.current = null;
    dirtyFields.current.clear();
    setDocumentStates({ contract: { file: null, status: "analyzed", error: null }, invoice: { file: null, status: "analyzed", error: null } });
    setAnalysis(null);
  }

  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-canvas font-sans text-ink">
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
            <h1>{step === 4 ? "Статус валютного перевода" : "Новый валютный перевод"}</h1>
            <p>Соберите документы, проверьте реквизиты и подготовьте платёж к подписи.</p>
          </div>
        </div>

        <ProgressStepper current={step} onGoTo={setStep} />

        <div className="workspace-grid grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                onAnalyzeFile={handleAnalyzeFile}
                onRemoveDocument={handleRemoveDocument}
                onUserEdit={markUserEdit}
                documentState={documentStates.contract}
                apiState={apiState}
              />
            )}
            {step === 2 && <ApplicationStep application={application} setApplication={setApplication} invoiceData={invoiceData} setInvoiceData={setInvoiceData} onAnalyzeFile={handleAnalyzeFile} onRemoveDocument={handleRemoveDocument} onUserEdit={markUserEdit} documentState={documentStates.invoice} />}
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
                invoice={invoiceData}
                onUserEdit={markUserEdit}
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
          <Aside step={step} contractNumber={contractNumber} contractData={contractData} payment={payment} application={application} consent={consent} analysis={analysis} />
        </div>
        <footer className="page-footer"><span>Помощник по валютным переводам</span><span>Платёж не отправляется без вашей подписи</span></footer>
      </main>
    </div>
  );
}

export default App;
