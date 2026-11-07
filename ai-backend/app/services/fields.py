from __future__ import annotations

from app.schemas.workflow import FieldDefinition


def _field(id: str, label: str, type: str, required: bool, source: str, dependencies: list[str], help_text: str) -> FieldDefinition:
    return FieldDefinition(id=id, label=label, type=type, required=required, source=source, editable=True, visible=True, dependencies=dependencies, help_text=help_text)


PAYMENT_FIELDS = [
    _field("debit_account", "Счёт списания", "account", True, "user", [], "Валютный счёт компании для списания."),
    _field("transfer_amount", "Сумма перевода", "decimal", True, "invoice", ["invoice.invoice_amount"], "Используйте сумму инвойса, а не всего договора, и подтвердите её вручную."),
    _field("value_date", "Дата валютирования", "date", True, "user", [], "Ожидаемая дата обработки перевода."),
    _field("urgent_transfer", "Срочный перевод", "boolean", False, "user", ["debit_account"], "Демонстрационная комиссия: 5 000 KZT. Фактическая доступность не проверяется."),
    _field("beneficiary_bank_swift", "SWIFT банка получателя", "text", True, "invoice", [], "Проверьте 8 или 11 латинских букв и цифр. Это проверка формата, а не банка."),
    _field("intermediary_bank", "Банк-посредник", "text", False, "invoice", [], "Заполняется, только если указан в банковских реквизитах."),
    _field("knp", "КНП", "select", True, "user", [], "Код назначения платежа."),
    _field("payment_purpose", "Назначение перевода", "text", True, "invoice", ["invoice.number", "invoice.amount"], "Укажите номер, дату, сумму и валюту инвойса."),
    _field("supporting_document_number", "Номер документа-основания", "text", True, "invoice", ["invoice.number"], "Укажите номер выбранного инвойса или другого документа."),
    _field("supporting_document_date", "Дата документа-основания", "date", True, "invoice", ["supporting_document_number"], "Укажите дату того же документа-основания."),
    _field("beneficiary_name", "Наименование получателя", "text", True, "contract", [], "Сверьте с подтверждёнными данными поставщика."),
    _field("beneficiary_residency_country", "Страна резидентства получателя", "select", True, "contract", [], "Укажите страну по документу или вручную."),
    _field("beneficiary_account", "Счёт получателя", "account", True, "invoice", [], "Введите только счёт, явно указанный в документе."),
    _field("kbe", "КБе", "text", True, "user", ["beneficiary_residency_country"], "Необходимо вручную проверить классификацию получателя."),
    _field("beneficiary_address_country", "Страна адреса получателя", "select", True, "contract", [], "Страна из адреса получателя."),
    _field("beneficiary_address_type", "Тип адреса", "select", True, "user", [], "Выберите юридический или фактический адрес."),
    _field("commission_type", "Тип комиссии", "select", True, "user", [], "OUR: «Все комиссии оплачиваю я.» BEN: «Комиссии удерживаются из суммы получателя.» SHA: «Я оплачиваю комиссию своего банка, остальные — получатель.»"),
    _field("commission_debit_account", "Счёт списания комиссии", "account", True, "user", ["commission_type"], "Выберите синтетический счёт для комиссии."),
    _field("director_signatory", "Руководитель", "select", True, "user", [], "Выберите синтетического подписанта. Подпись не создаётся."),
    _field("chief_accountant_signatory", "Главный бухгалтер", "select", False, "user", [], "Можно выбрать «Не предусмотрен»."),
    _field("agreement_accepted", "Согласие с условиями", "boolean", True, "user", [], "Установите вручную после проверки. AI не включает согласие автоматически."),
]
