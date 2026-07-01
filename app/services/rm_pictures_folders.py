"""Default Pictures subfolders for Repairs & Maintenance projects and opportunities."""
from __future__ import annotations

from typing import TYPE_CHECKING, List, Tuple

from sqlalchemy.orm import Session

from ..models.models import ProjectFolder
from .business_line import BUSINESS_LINE_REPAIRS_MAINTENANCE

if TYPE_CHECKING:
    from ..models.models import Project

PICTURES_CATEGORY = "pictures"

RM_PICTURES_DEFAULT_FOLDERS: List[Tuple[str, int]] = [
    ("Invoice Photos", 0),
    ("Unused Extra Invoicing Photos", 1),
    ("Proposal Photos", 2),
    ("Unused Extra Proposal Photos", 3),
    ("Photos for Additional Recommendations", 4),
]


def ensure_rm_pictures_default_folders(db: Session, project: "Project") -> int:
    """
    Create default Pictures subfolders for R&M projects (idempotent).
    Returns the number of folders created.
    """
    if getattr(project, "business_line", None) != BUSINESS_LINE_REPAIRS_MAINTENANCE:
        return 0

    project_id = project.id
    created = 0

    for name, sort_index in RM_PICTURES_DEFAULT_FOLDERS:
        existing = (
            db.query(ProjectFolder)
            .filter(
                ProjectFolder.project_id == project_id,
                ProjectFolder.category == PICTURES_CATEGORY,
                ProjectFolder.name == name,
                ProjectFolder.parent_id.is_(None),
            )
            .first()
        )
        if existing:
            continue
        db.add(
            ProjectFolder(
                project_id=project_id,
                category=PICTURES_CATEGORY,
                parent_id=None,
                name=name,
                sort_index=sort_index,
            )
        )
        created += 1

    if created:
        db.commit()

    return created
