from fastapi import APIRouter

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings_bundle():
    return {
        "project_statuses": [],
        "divisions": [],
        "file_categories": [],
        "client_types": [],
        "client_statuses": [],
        "payment_terms": [],
    }

