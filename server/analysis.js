import cases from '../data/cases.json' with { type: 'json' };

export const demoCases = cases;
// Order follows the 25-field payment form supplied with the brief.
export const paymentFields = [
  ['requestNumber','Номер заявки','system'],['debitAccount','Счёт списания','user'],['amount','Сумма перевода','invoice'],
  ['valueDate','Дата валютирования','user'],['urgent','Срочный перевод','user'],['beneficiarySwift','SWIFT банка получателя','invoice'],
  ['intermediaryBank','Банк-посредник','user'],['knp','КНП','user'],['purpose','Назначение перевода','suggestion'],
  ['linkContract','Привязать валютный договор','suggestion'],['documentNumber','Номер документа','invoice'],
  ['documentDate','Дата документа','invoice'],['documents','Загрузить документы','user'],
  ['beneficiaryName','Наименование получателя','invoice'],['residencyCountry','Страна резидентства','invoice'],
  ['beneficiaryIban','Счёт получателя','invoice'],['kbe','КБе','user'],['beneficiaryCountry','Страна получателя','invoice'],
  ['addressType','Тип адреса','user'],['commission','Тип комиссии','invoice'],['commissionAccount','Счёт списания комиссии','user'],
  ['firstSigner','Руководитель','user'],['secondSigner','Главный бухгалтер','user'],['useBonuses','Потратить бонусы','user'],
  ['acceptTerms','Принять условия','user']
].map(([key,label,owner],i)=>({number:i+1,key,label,owner}));

const filled = x => x !== null && x !== undefined && x !== '';
const issue = (code,severity,field,message,nextStep)=>({code,severity,field,message,nextStep});

export function analyze({contract={},invoice={},edits={}}={}) {
  const suggestions={
    amount:invoice.amount??null,beneficiarySwift:invoice.beneficiarySwift??null,
    purpose:filled(invoice.description)&&filled(contract.number)&&filled(invoice.number)
      ? `Оплата по договору ${contract.number}, инвойс ${invoice.number}; товар: ${invoice.description.toLowerCase()}`:null,
    linkContract:true,documentNumber:invoice.number??null,documentDate:invoice.date??null,
    beneficiaryName:invoice.beneficiaryName??null,residencyCountry:invoice.beneficiaryCountry??null,
    beneficiaryIban:invoice.beneficiaryIban??null,beneficiaryCountry:invoice.beneficiaryCountry??null,
    commission:invoice.commission??null
  };
  const fields={...suggestions,...edits};
  const sourcePaths={documentNumber:'invoice.number',documentDate:'invoice.date',residencyCountry:'invoice.beneficiaryCountry',beneficiaryCountry:'invoice.beneficiaryCountry'};
  const provenance=Object.fromEntries(Object.keys(suggestions).map(key=>[key,{
    source:key==='purpose'||key==='linkContract'?'contract+invoice':'invoice',
    path:key==='purpose'||key==='linkContract'?'contract.number + invoice.number':(sourcePaths[key]||`invoice.${key}`),
    confidence:key==='purpose'||key==='linkContract'?'suggested':'from-document',requiresUserReview:true
  }]));
  const issues=[];
  if(!filled(fields.beneficiaryIban)) issues.push(issue('MISSING_IBAN','blocking','beneficiaryIban','В инвойсе нет счёта получателя.','Запросите реквизиты у поставщика и проверьте их перед вводом.'));
  if(!filled(fields.beneficiarySwift)) issues.push(issue('MISSING_SWIFT','blocking','beneficiarySwift','Не указан SWIFT/BIC банка получателя.','Уточните банковские реквизиты у поставщика.'));
  if(filled(contract.number)&&filled(invoice.contractNumber)&&contract.number!==invoice.contractNumber) issues.push(issue('CONTRACT_NUMBER_MISMATCH','blocking','documentNumber','Инвойс ссылается на другой номер договора.','Сверьте номер с поставщиком.'));
  if(filled(contract.seller)&&filled(invoice.seller)&&contract.seller!==invoice.seller) issues.push(issue('SELLER_MISMATCH','blocking','beneficiaryName','Продавец в договоре и инвойсе различается.','Проверьте стороны документов.'));
  if(filled(contract.currency)&&filled(invoice.currency)&&contract.currency!==invoice.currency) issues.push(issue('CURRENCY_MISMATCH','blocking','amount','Валюты договора и инвойса различаются.','Уточните условия оплаты и валюту платежа.'));
  if(Number.isFinite(contract.total)&&Number.isFinite(invoice.amount)&&invoice.amount>contract.total) issues.push(issue('AMOUNT_EXCEEDS_CONTRACT','blocking','amount',`Сумма инвойса ${invoice.amount} ${invoice.currency} превышает общую сумму договора ${contract.total} ${contract.currency}.`,'Проверьте инвойс и договор; при необходимости запросите исправление или дополнительное соглашение.'));
  if(filled(edits.amount)&&edits.amount!==invoice.amount) issues.push(issue('EDITED_AMOUNT_DIFFERS','blocking','amount','Введённая сумма отличается от инвойса.','Проверьте основание изменения суммы.'));
  if(!filled(contract.unk)) issues.push(issue('UNK_REVIEW','review','unk','В материалах нет УНК.','Уточните у банка, требуется ли постановка договора на учёт для этого случая.'));
  const proposedCount=Object.values(suggestions).filter(filled).length;
  const blockingCount=issues.filter(x=>x.severity==='blocking').length;
  return {fields,suggestions,provenance,issues,
    status:blockingCount?'needs-correction':'draft-review',
    nextStep:blockingCount?'Исправьте отмеченные данные, затем повторите проверку.':'Проверьте все предложенные данные и заполните остальные поля вручную.',
    metrics:{totalPaymentFields:25,proposedCount,autoFilledCount:Object.entries(suggestions).filter(([k,v])=>filled(v)&&!Object.hasOwn(edits,k)).length,
      manualOrSystemCount:25-proposedCount,blockingCount,detectedIssueCount:issues.length,correctedFieldCount:Object.keys(edits).length},
    disclaimer:'Демонстрационный черновик на синтетических данных. УНК, КНП, КБе, документы и реквизиты проверяет человек; отправки или подписания нет.'};
}
