from __future__ import annotations

import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from app.schemas.workflow import Issue

AMOUNT = r"(?:\d{1,3}(?:[\s\u00a0]\d{3})+(?:[,.]\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[,.]\d{1,2})?)"
MONEY_RE = re.compile(
    rf"(?:(?P<prefix>USD|EUR|CNY|GBP|KZT)\s*(?P<pamount>{AMOUNT})|"
    rf"(?P<samount>{AMOUNT})\s*(?P<suffix>USD|EUR|CNY|GBP|KZT))\b", re.I
)
SWIFT_RE = re.compile(r"^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$")


def _decimal(raw: str) -> Decimal | None:
    compact = re.sub(r"[\s\u00a0]", "", raw)
    if "," in compact and "." in compact:
        decimal_mark = "," if compact.rfind(",") > compact.rfind(".") else "."
        compact = compact.replace("." if decimal_mark == "," else ",", "").replace(decimal_mark, ".")
    elif compact.count(",") == 1:
        left, right = compact.split(",")
        compact = left + ("." + right if len(right) <= 2 else right)
    elif compact.count(".") == 1:
        left, right = compact.split(".")
        compact = left + ("." + right if len(right) <= 2 else right)
    else:
        compact = compact.replace(",", "").replace(".", "")
    try:
        return Decimal(compact)
    except InvalidOperation:
        return None


def extract_money(text: str) -> list[tuple[Decimal, str]]:
    values: list[tuple[Decimal, str]] = []
    for match in MONEY_RE.finditer(text or ""):
        amount = _decimal(match.group("pamount") or match.group("samount"))
        currency = (match.group("prefix") or match.group("suffix")).upper()
        if amount is not None:
            values.append((amount, currency))
    return values


def parse_money(text: str) -> tuple[Decimal | None, str | None]:
    values = extract_money(text)
    return values[0] if values else (None, None)


def iban_valid(value: str) -> bool | None:
    compact = re.sub(r"\s", "", value or "").upper()
    if not re.match(r"^[A-Z]{2}\d{2}", compact):
        return None
    if not re.fullmatch(r"[A-Z0-9]{15,34}", compact):
        return False
    numeric = "".join(str(ord(c) - 55) if c.isalpha() else c for c in compact[4:] + compact[:4])
    return int(numeric) % 97 == 1


def _issue(code: str, severity: str, title: str, message: str, fields: list[str], action: str, step: str) -> Issue:
    return Issue(id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"bcc-ved:{code}:{','.join(fields)}")), code=code, severity=severity,
                 title=title, message=message, field_ids=fields, recommended_action=action, blocking_step=step)


def _value(record: dict[str, Any], name: str) -> Any:
    field = record.get("fields", {}).get(name)
    return field.get("value") if isinstance(field, dict) else None


def evaluate_workflow(data: dict[str, Any]) -> tuple[list[Issue], list[str]]:
    issues: list[Issue] = []
    payment = data["payment"]["fields"]
    underlying = data["payment"]["underlying"]
    invoice_amount_raw = underlying.get("invoice_amount") or _value(data["invoice"], "invoice_amount") or _value(data["invoice"], "amount")
    invoice_currency = underlying.get("invoice_currency") or _value(data["invoice"], "invoice_currency") or _value(data["invoice"], "currency")
    invoice_amount = Decimal(str(invoice_amount_raw)) if invoice_amount_raw not in (None, "") else None

    required = ["debit_account", "transfer_amount", "value_date", "beneficiary_bank_swift", "knp", "payment_purpose",
                "supporting_document_number", "supporting_document_date", "beneficiary_name", "beneficiary_residency_country",
                "beneficiary_account", "kbe", "beneficiary_address_country", "beneficiary_address_type", "commission_type",
                "commission_debit_account", "director_signatory", "agreement_accepted"]
    missing = [field for field in required if payment.get(field) in (None, "", False)]
    for field in missing:
        title = "Не заполнено обязательное поле"
        message = "Для подготовки платежа требуется заполнить это поле."
        if field == "agreement_accepted":
            title, message = "Не подтверждено согласие", "Подтвердите согласие вручную после проверки платёжных данных."
        issues.append(_issue("REQUIRED_FIELD_MISSING", "blocking", title, message, [field], "Заполните поле и повторите проверку.", "payment"))

    supporting = _value(data["application"], "supporting_documents")
    invoice_number = _value(data["invoice"], "invoice_number") or _value(data["invoice"], "number")
    if not supporting or not invoice_number or invoice_amount is None:
        issues.append(_issue("MISSING_SUPPORTING_DOCUMENT", "blocking", "Не хватает подтверждающего документа",
            "Для завершения подготовки заявления нужен документ-основание.", ["supporting_documents"],
            "Загрузите документ или укажите его реквизиты.", "application"))

    purpose_values = extract_money(str(payment.get("payment_purpose", "")))
    if len(purpose_values) > 1:
        issues.append(_issue("PAYMENT_PURPOSE_AMOUNT_AMBIGUOUS", "warning", "В назначении указано несколько сумм",
            "Нельзя однозначно определить сумму перевода в назначении.", ["payment_purpose"],
            "Оставьте одну явно обозначенную сумму платежа или проверьте назначение вручную.", "payment"))
    elif len(purpose_values) == 1 and invoice_amount is not None:
        purpose_amount, purpose_currency = purpose_values[0]
        if purpose_amount != invoice_amount or purpose_currency != invoice_currency:
            shown_actual = f"{purpose_amount:,.0f}".replace(",", " ")
            shown_expected = f"{invoice_amount:,.0f}".replace(",", " ")
            issues.append(_issue("PAYMENT_PURPOSE_AMOUNT_MISMATCH", "blocking", "Сумма не совпадает с инвойсом",
                f"В назначении перевода указано {shown_actual} {purpose_currency}, а в инвойсе — {shown_expected} {invoice_currency}.",
                ["payment_purpose", "transfer_amount"], "Проверьте сумму и исправьте назначение перевода или уточните данные инвойса.", "payment"))

    transfer_amount = payment.get("transfer_amount")
    if invoice_amount is not None and transfer_amount not in (None, "") and Decimal(str(transfer_amount)) != invoice_amount:
        issues.append(_issue("TRANSFER_AMOUNT_MISMATCH", "blocking", "Сумма перевода не совпадает с инвойсом",
            "Поле суммы перевода отличается от подтверждённой суммы инвойса.", ["transfer_amount"],
            "Проверьте оба значения и вручную исправьте ошибочное.", "payment"))

    swift = str(payment.get("beneficiary_bank_swift", "")).upper()
    if swift and not SWIFT_RE.fullmatch(swift):
        issues.append(_issue("INVALID_SWIFT", "blocking", "Неверный формат SWIFT", "SWIFT должен содержать 8 или 11 допустимых символов.",
            ["beneficiary_bank_swift"], "Сверьте SWIFT с реквизитами поставщика.", "payment"))
    account = str(payment.get("beneficiary_account", ""))
    valid_iban = iban_valid(account)
    if valid_iban is False:
        issues.append(_issue("INVALID_IBAN", "blocking", "Не прошла проверка IBAN", "Контрольная сумма IBAN неверна.",
            ["beneficiary_account"], "Сверьте счёт с документом поставщика.", "payment"))

    if payment.get("urgent_transfer") and not payment.get("debit_account"):
        issues.append(_issue("URGENT_TRANSFER_ACCOUNT_REQUIRED", "blocking", "Сначала выберите счёт списания",
            "Срочный перевод зависит от выбранного счёта. Демонстрационная комиссия составляет 5 000 KZT.",
            ["urgent_transfer", "debit_account"], "Выберите синтетический счёт и повторите проверку.", "payment"))

    contract_amount_raw = _value(data["contract"], "contract_amount") or _value(data["contract"], "amount")
    registration_number = _value(data["contract"], "contract_registration_number")
    if contract_amount_raw is None or Decimal(str(contract_amount_raw)) > Decimal("50000"):
        data["application"]["registration_review_required"] = True
        data["application"]["registration_review_reason"] = "Демонстрационное правило: импортный договор превышает 50 000 USD или не содержит суммы."
        if not registration_number:
            issues.append(_issue("REGISTRATION_REVIEW_REQUIRED", "warning", "Возможна учётная регистрация",
                "Для этого договора может потребоваться учётная регистрация. Проверьте наличие УНК перед дальнейшим оформлением.",
                ["contract_registration_number"], "Проверьте УНК и при наличии внесите его вручную.", "application"))

    return issues, missing
