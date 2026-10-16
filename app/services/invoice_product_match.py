"""Suggest catalog products for lines read from an invoice PDF.

Matching is a suggestion only. Callers show the result for review and do not
write estimate rows until the user confirms.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Optional, Sequence


_MIN_TEXT_CHARS = 40
_MATCH_SCORE = 0.72
_MATCH_GAP = 0.12
_CANDIDATE_SCORE = 0.45
_SIMILAR_LIMIT = 40
_FAMILY_MIN_LETTERS = 5
_SUPPLIER_BOOST = 0.12

_MONEY_RE = re.compile(r"\$?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2,4})")
_PRICE_TOKEN_RE = re.compile(r"^\$?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2,4}$")
_QTY_TOKEN_RE = re.compile(r"^\d+(?:\.\d+)?$")
_CODE_TOKEN_RE = re.compile(r"^\d{4,}$")
_LEADING_QTY_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s+")
_WORD_RE = re.compile(r"[a-z0-9]+")
_ROW_Y_TOLERANCE = 2.5

_STOPWORDS = {
    "a",
    "an",
    "and",
    "box",
    "ea",
    "each",
    "for",
    "of",
    "pc",
    "pcs",
    "per",
    "qty",
    "the",
    "unit",
    "with",
}
_SKIP_WORDS = {
    "acct",
    "amount",
    "balance",
    "bcpst",
    "buyer",
    "cartage",
    "charge",
    "delivery",
    "deposit",
    "due",
    "freight",
    "grand",
    "gst",
    "hst",
    "invoice",
    "method",
    "methods",
    "number",
    "page",
    "pay",
    "please",
    "pst",
    "qst",
    "sales",
    "shipping",
    "signature",
    "sub",
    "subtotal",
    "tax",
    "this",
    "total",
    "vat",
}
_UNIT_TOKENS = {
    "bag",
    "bd",
    "bdl",
    "box",
    "bundle",
    "can",
    "drum",
    "ea",
    "each",
    "ft",
    "gal",
    "length",
    "lf",
    "pail",
    "pair",
    "pc",
    "pcs",
    "roll",
    "set",
    "sf",
    "sq",
    "tube",
}
_FLAG_TOKENS = {"d", "n", "t", "y"}


@dataclass
class ParsedInvoiceLine:
    description: str
    quantity: Optional[float]
    invoice_unit_price: Optional[float]


def extract_pdf_text(pdf_bytes: bytes) -> str:
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return "\n".join((page.get_text("text") or "") for page in doc)
    finally:
        doc.close()


def extract_pdf_words(pdf_bytes: bytes) -> list[tuple]:
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        words = []
        for page in doc:
            for word in page.get_text("words"):
                words.append((word[0], word[1], word[2], word[3], word[4]))
        return words
    finally:
        doc.close()


def invoice_rows_text(words: Sequence[tuple]) -> str:
    """One visual row per line so column invoices stay in reading order."""
    lines: list[str] = []
    for row in _cluster_rows(words):
        text = " ".join(str(word[4]) for word in row if str(word[4]).strip())
        if text:
            lines.append(text)
    return "\n".join(lines)


def match_invoice_pdf(
    pdf_bytes: bytes,
    materials: Sequence[Any],
    *,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    extract_lines: Optional[Callable[[str], list[ParsedInvoiceLine]]] = None,
) -> dict:
    try:
        text = extract_pdf_text(pdf_bytes)
        words = extract_pdf_words(pdf_bytes)
    except Exception:
        return _unreadable()
    row_text = invoice_rows_text(words).strip()
    source = row_text if len(row_text) >= _MIN_TEXT_CHARS else (text or "").strip()
    key, model_name = _model_settings(api_key, model)
    lines: Optional[list[ParsedInvoiceLine]] = None
    if key:
        try:
            reader = extract_lines or (lambda body: extract_lines_from_model(body, key, model_name))
            lines = reader(source)
        except Exception:
            lines = None
    if lines is None:
        lines = parse_positioned_rows(words)
        if not lines:
            lines = parse_invoice_lines(text)
    lines = apply_labeled_quantities(lines or [], words)
    return _catalog_products(source or text, lines, materials)


def match_invoice_text(text: str, materials: Sequence[Any]) -> dict:
    cleaned = (text or "").strip()
    lines = parse_invoice_lines(cleaned) if len(cleaned) >= _MIN_TEXT_CHARS else []
    return _catalog_products(cleaned, lines, materials)


def _model_settings(api_key: Optional[str], model: Optional[str]) -> tuple[str, str]:
    if api_key is None or model is None:
        from ..config import settings

        if api_key is None:
            api_key = settings.openai_api_key or ""
        if model is None:
            model = settings.openai_model or "gpt-4o-mini"
    return (api_key or "").strip(), model or "gpt-4o-mini"


def extract_lines_from_model(text: str, api_key: str, model: str) -> list[ParsedInvoiceLine]:
    import httpx

    payload = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Extract product line items from supplier invoice text. "
                    "Return JSON with an items array. Each item has description, quantity, and unit_price. "
                    "description is the product name. quantity and unit_price are numbers or null. "
                    "Omit tax, freight, shipping, cartage, totals, addresses, and payment lines."
                ),
            },
            {"role": "user", "content": (text or "")[:120000]},
        ],
    }
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    return parse_model_items(content)


def parse_model_items(content: str) -> list[ParsedInvoiceLine]:
    data = json.loads(content)
    rows = data.get("items") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise ValueError("model response has no items")
    lines: list[ParsedInvoiceLine] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        description = str(row.get("description") or "").strip()
        if not description or _is_skipped(description) or _is_freight(description):
            continue
        lines.append(
            ParsedInvoiceLine(
                description=description,
                quantity=_optional_float(row.get("quantity")),
                invoice_unit_price=_optional_float(row.get("unit_price")),
            )
        )
    return lines


def _optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:
        return None
    return number


def _catalog_products(text: str, lines: list[ParsedInvoiceLine], materials: Sequence[Any]) -> dict:
    cleaned = (text or "").strip()
    if len(cleaned) < _MIN_TEXT_CHARS and not lines:
        return _unreadable()
    detected = _detect_suppliers(cleaned, materials)
    products: list[dict] = []
    seen: set[Any] = set()
    for line in lines:
        material = _best_material(line, materials, detected)
        if material is None:
            continue
        material_id = getattr(material, "id", None)
        if material_id in seen:
            continue
        seen.add(material_id)
        payload = _candidate_payload(material)
        payload["quantity"] = _quantity_value(line.quantity)
        payload["invoice_description"] = line.description
        payload["similar"] = [
            _candidate_payload(candidate)
            for candidate in _similar_materials(line, materials, detected, material_id)
        ]
        products.append(payload)
    return {
        "readable": True,
        "found_count": len(products),
        "products": products,
    }


def _quantity_value(quantity: Optional[float]) -> float:
    if quantity is None or quantity <= 0:
        return 1
    if float(quantity).is_integer():
        return int(quantity)
    return float(quantity)


def _family_token(name: str) -> Optional[str]:
    """Longest real word in the chosen product name, used as the product family."""
    words = [
        word
        for word in re.findall(r"[a-z]+", (name or "").lower())
        if word not in _STOPWORDS and word not in _UNIT_TOKENS and len(word) >= _FAMILY_MIN_LETTERS
    ]
    if not words:
        return None
    return max(words, key=len)


def _similar_materials(
    line: ParsedInvoiceLine,
    materials: Sequence[Any],
    _detected_suppliers: set[str],
    chosen_id: Any,
) -> list[Any]:
    chosen = next((material for material in materials if getattr(material, "id", None) == chosen_id), None)
    if chosen is None:
        return []
    family = _family_token(str(getattr(chosen, "name", None) or ""))
    if not family:
        return []
    invoice_tokens = _tokens(line.description)
    ranked: list[tuple[float, str, Any]] = []
    for material in materials:
        if getattr(material, "id", None) == chosen_id:
            continue
        name = str(getattr(material, "name", None) or "")
        if family not in re.findall(r"[a-z]+", name.lower()):
            continue
        ranked.append((_name_score(invoice_tokens, _tokens(name)), name.lower(), material))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return [material for _, _, material in ranked[:_SIMILAR_LIMIT]]


def _best_material(
    line: ParsedInvoiceLine,
    materials: Sequence[Any],
    detected_suppliers: set[str],
) -> Optional[Any]:
    ranked = _rank_materials(line, materials, detected_suppliers)
    if not ranked:
        return None
    top = ranked[0][0]
    second = ranked[1][0] if len(ranked) > 1 else 0.0
    if top >= _MATCH_SCORE and (top - second) >= _MATCH_GAP:
        return ranked[0][1]
    if top >= _CANDIDATE_SCORE:
        return ranked[0][1]
    return None


_QTY_HEADER_RE = re.compile(
    r"^(qty|quantity|qte|quantite|qtyshipped|qtyordered|qtyreceived|shippedqty|orderqty)$"
)
_QTY_HEADER_DISTANCE = 90


def apply_labeled_quantities(
    lines: Sequence[ParsedInvoiceLine],
    words: Sequence[tuple],
) -> list[ParsedInvoiceLine]:
    """Use a number as quantity only when it sits under a Quantity/Qty column."""
    rows = _cluster_rows(words)
    column = _quantity_column_center(rows)
    updated: list[ParsedInvoiceLine] = []
    for line in lines:
        quantity = _quantity_on_matching_row(rows, line.description, column) if column is not None else None
        updated.append(
            ParsedInvoiceLine(
                description=line.description,
                quantity=quantity,
                invoice_unit_price=line.invoice_unit_price,
            )
        )
    return updated


def _quantity_column_center(rows: Sequence[Sequence[tuple]]) -> Optional[float]:
    for row in rows:
        span = _qty_header_span(row)
        if span is None:
            continue
        return (span[0] + span[1]) / 2
    return None


def _qty_header_span(row: Sequence[tuple]) -> Optional[tuple[float, float]]:
    words = [word for word in row if str(word[4]).strip()]
    for start in range(len(words)):
        for length in (1, 2, 3):
            chunk = words[start : start + length]
            if len(chunk) < length:
                break
            label = "".join(_letters(str(word[4])) for word in chunk)
            if not _QTY_HEADER_RE.match(label):
                continue
            return (float(chunk[0][0]), float(chunk[-1][2]))
    return None


def _letters(value: str) -> str:
    import unicodedata

    normalized = unicodedata.normalize("NFKD", value or "")
    return "".join(char for char in normalized.lower() if char.isascii() and char.isalpha())


def _quantity_on_matching_row(
    rows: Sequence[Sequence[tuple]],
    description: str,
    column_center: float,
) -> Optional[float]:
    wanted = set(_tokens(description))
    if not wanted:
        return None
    best_row: Optional[Sequence[tuple]] = None
    best_overlap = 0
    for row in rows:
        row_tokens = set(_tokens(" ".join(str(word[4]) for word in row)))
        overlap = len(wanted & row_tokens)
        if overlap > best_overlap:
            best_overlap = overlap
            best_row = row
    if best_row is None or best_overlap == 0:
        return None
    return _number_near_x(best_row, column_center)


def _number_near_x(row: Sequence[tuple], column_center: float) -> Optional[float]:
    best: Optional[tuple[float, float]] = None
    for word in row:
        token = str(word[4]).replace(",", "").replace("$", "")
        if not re.fullmatch(r"\d{1,6}(?:\.\d+)?", token):
            continue
        center = (float(word[0]) + float(word[2])) / 2
        distance = abs(center - column_center)
        if distance > _QTY_HEADER_DISTANCE:
            continue
        if best is None or distance < best[0]:
            best = (distance, float(token))
    if best is None:
        return None
    return best[1]


def parse_positioned_rows(words: Sequence[tuple]) -> list[ParsedInvoiceLine]:
    """Read item rows from column layout. Plain text splits these invoices apart."""
    parsed: list[ParsedInvoiceLine] = []
    for row in _cluster_rows(words):
        line = _parse_positioned_row(row)
        if line:
            parsed.append(line)
    return parsed


def _cluster_rows(words: Sequence[tuple]) -> list[list[tuple]]:
    ordered = sorted(words, key=lambda word: (word[1], word[0]))
    rows: list[list[tuple]] = []
    for word in ordered:
        if rows and abs(word[1] - rows[-1][0][1]) <= _ROW_Y_TOLERANCE:
            rows[-1].append(word)
        else:
            rows.append([word])
    for row in rows:
        row.sort(key=lambda word: word[0])
    return rows


def _parse_positioned_row(row: Sequence[tuple]) -> Optional[ParsedInvoiceLine]:
    tokens = [str(word[4]) for word in row if str(word[4]).strip()]
    prices = [_price_value(token) for token in tokens]
    prices = [price for price in prices if price is not None]
    if not prices:
        return None
    drop_leading = bool(tokens) and _looks_like_line_qty(tokens[0])
    description = _description_from_tokens(tokens, drop_leading)
    if _is_skipped(description) or _is_freight(description):
        return None
    return ParsedInvoiceLine(
        description=description,
        quantity=None,
        invoice_unit_price=_unit_price(prices, None),
    )


def _looks_like_line_qty(token: str) -> bool:
    return bool(_QTY_TOKEN_RE.match(token)) and not _CODE_TOKEN_RE.match(token)


def _price_value(token: str) -> Optional[float]:
    compact = token.replace(" ", "")
    if not _PRICE_TOKEN_RE.match(compact):
        return None
    return float(compact.replace("$", "").replace(",", ""))


def _description_from_tokens(tokens: Sequence[str], drop_leading_qty: bool) -> str:
    parts: list[str] = []
    seen_description = False
    for index, token in enumerate(tokens):
        if index == 0 and drop_leading_qty:
            continue
        if _price_value(token) is not None:
            continue
        lowered = token.lower()
        if lowered in _UNIT_TOKENS or lowered in _FLAG_TOKENS:
            continue
        # Item numbers sit to the left of the name. Digits inside the name stay.
        if _CODE_TOKEN_RE.match(token) and not seen_description:
            continue
        if re.search(r"[A-Za-z]", token):
            seen_description = True
        parts.append(token)
    return " ".join(parts).strip()


def _is_freight(description: str) -> bool:
    words = re.findall(r"[a-z]+", description.lower())
    return any(word == "freight" or word == "shipping" or word.startswith("cartage") for word in words)


def parse_invoice_lines(text: str) -> list[ParsedInvoiceLine]:
    parsed: list[ParsedInvoiceLine] = []
    for raw in (text or "").splitlines():
        line = " ".join(raw.split())
        if not line:
            continue
        amounts = _money_amounts(line)
        if not amounts:
            continue
        without_money = _MONEY_RE.sub(" ", line)
        without_money = " ".join(without_money.split())
        _quantity, description = _split_quantity(without_money)
        if _is_skipped(description):
            continue
        parsed.append(
            ParsedInvoiceLine(
                description=description,
                quantity=None,
                invoice_unit_price=_unit_price(amounts, None),
            )
        )
    return parsed


def _unreadable() -> dict:
    return {"readable": False, "found_count": 0, "products": []}


def _money_amounts(line: str) -> list[float]:
    amounts: list[float] = []
    for match in _MONEY_RE.finditer(line):
        whole = match.group(1).replace(",", "")
        amounts.append(float(f"{whole}.{match.group(2)}"))
    return amounts


def _split_quantity(text: str) -> tuple[Optional[float], str]:
    match = _LEADING_QTY_RE.match(text)
    if not match:
        return None, text.strip()
    qty = float(match.group(1))
    if qty <= 0 or qty > 100000:
        return None, text.strip()
    description = text[match.end() :].strip()
    if not description:
        return None, text.strip()
    return qty, description


def _is_skipped(description: str) -> bool:
    words = re.findall(r"[a-z]+", description.lower())
    if not words:
        return True
    glue = {"at", "be", "by", "from", "if", "is", "on", "or", "to"}
    ignored = _SKIP_WORDS | _STOPWORDS | glue
    return all(word in ignored for word in words)


def _unit_price(amounts: list[float], quantity: Optional[float]) -> Optional[float]:
    if not amounts:
        return None
    if len(amounts) >= 2 and quantity:
        unit_candidate, extended = amounts[-2], amounts[-1]
        tolerance = max(0.05, abs(extended) * 0.02)
        if abs(quantity * unit_candidate - extended) <= tolerance:
            return round(unit_candidate, 2)
        if abs(quantity * extended - unit_candidate) <= tolerance:
            return round(extended, 2)
        return round(unit_candidate, 2)
    return round(amounts[0], 2)


def _tokens(value: str) -> list[str]:
    return [
        token
        for token in _WORD_RE.findall((value or "").lower())
        if token not in _STOPWORDS and len(token) > 1
    ]


def _detect_suppliers(text: str, materials: Sequence[Any]) -> set[str]:
    head = re.sub(r"\s+", " ", (text or "")[:2000].lower())
    found: set[str] = set()
    for material in materials:
        name = str(getattr(material, "supplier_name", None) or "").strip()
        if len(name) < 4:
            continue
        if name.lower() in head:
            found.add(name.lower())
    return found


def _name_score(invoice_tokens: list[str], product_tokens: list[str]) -> float:
    if not invoice_tokens or not product_tokens:
        return 0.0
    overlap = set(invoice_tokens) & set(product_tokens)
    if not overlap:
        return 0.0
    recall = len(overlap) / len(set(invoice_tokens))
    precision = len(overlap) / len(set(product_tokens))
    return 0.65 * recall + 0.35 * precision


def _rank_materials(
    line: ParsedInvoiceLine,
    materials: Sequence[Any],
    detected_suppliers: set[str],
) -> list[tuple[float, Any]]:
    invoice_tokens = _tokens(line.description)
    ranked: list[tuple[float, Any]] = []
    for material in materials:
        name = str(getattr(material, "name", None) or "")
        score = _name_score(invoice_tokens, _tokens(name))
        if score <= 0:
            continue
        supplier = str(getattr(material, "supplier_name", None) or "").strip().lower()
        if detected_suppliers and supplier and supplier in detected_suppliers:
            score = min(1.0, score + _SUPPLIER_BOOST)
        elif detected_suppliers and supplier and supplier not in detected_suppliers:
            score = max(0.0, score - 0.08)
        ranked.append((score, material))
    ranked.sort(key=lambda row: row[0], reverse=True)
    return ranked


def _candidate_payload(material: Any) -> dict:
    def _num(attr: str) -> Optional[float]:
        value = getattr(material, attr, None)
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return {
        "id": getattr(material, "id", None),
        "name": getattr(material, "name", None),
        "supplier_name": getattr(material, "supplier_name", None),
        "unit": getattr(material, "unit", None),
        "price": _num("price"),
        "unit_type": getattr(material, "unit_type", None),
        "units_per_package": _num("units_per_package"),
        "coverage_sqs": _num("coverage_sqs"),
        "coverage_ft2": _num("coverage_ft2"),
        "coverage_m2": _num("coverage_m2"),
    }
