import uuid

from app.document_creator.export_pdf_result_cache import (
    store_export_pdf_result,
    take_export_pdf_result,
)


def test_store_and_take_one_shot():
    user_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    token = store_export_pdf_result(
        pdf_bytes=b"%PDF-1.4",
        user_id=user_id,
        document_id=doc_id,
        filename="demo.pdf",
    )
    item = take_export_pdf_result(token, user_id=user_id, document_id=doc_id)
    assert item is not None
    assert item.pdf_bytes.startswith(b"%PDF")
    assert item.filename == "demo.pdf"
    # One-shot
    assert take_export_pdf_result(token, user_id=user_id, document_id=doc_id) is None


def test_take_rejects_wrong_user_or_doc():
    user_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    token = store_export_pdf_result(
        pdf_bytes=b"%PDF-1.4",
        user_id=user_id,
        document_id=doc_id,
        filename="demo.pdf",
    )
    assert take_export_pdf_result(token, user_id=uuid.uuid4(), document_id=doc_id) is None
    assert take_export_pdf_result(token, user_id=user_id, document_id=uuid.uuid4()) is None
    # Still available for the rightful owner
    assert take_export_pdf_result(token, user_id=user_id, document_id=doc_id) is not None
