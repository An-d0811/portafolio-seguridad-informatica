from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog, User


def write_audit_log(
    db: Session,
    user: User | None,
    action: str,
    resource: str,
    resource_id: str | None = None,
    request: Request | None = None,
    metadata: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=user.organization_id if user else None,
            user_id=user.id if user else None,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip_address=request.client.host if request and request.client else None,
            metadata_json=metadata,
        )
    )
    db.commit()
