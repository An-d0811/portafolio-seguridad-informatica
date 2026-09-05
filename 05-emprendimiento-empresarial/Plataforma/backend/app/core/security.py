import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


class Role(StrEnum):
    admin = "admin"
    evaluator = "evaluator"
    viewer = "viewer"


ROLE_PERMISSIONS = {
    Role.admin: {"*"},
    Role.evaluator: {"assets:read", "assets:write", "evaluations:read", "evaluations:write", "reports:read", "reports:write", "alerts:read", "mitigations:read", "mitigations:write"},
    Role.viewer: {"assets:read", "evaluations:read", "reports:read", "alerts:read", "mitigations:read"},
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": subject, "exp": expires}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    settings = get_settings()
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc
    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        raise credentials_error
    return user


def require_permission(permission: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        permissions = ROLE_PERMISSIONS.get(Role(current_user.role), set())
        if "*" not in permissions and permission not in permissions:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        if current_user.mfa_enabled and not current_user.mfa_verified:
            raise HTTPException(status_code=403, detail="MFA verification required")
        return current_user

    return dependency


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if Role(current_user.role) is not Role.admin:
        raise HTTPException(status_code=403, detail="Administrator role required")
    return current_user


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii")


def _totp_code(secret: str, step: int = 30) -> str:
    key = base64.b32decode(secret.upper())
    counter = int(time.time() // step)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{binary % 1000000:06d}"


def verify_totp(secret: str, code: str) -> bool:
    if not secret:
        return False
    for drift in (-1, 0, 1):
        if hmac.compare_digest(_totp_code(secret, 30 + drift), code.strip()):
            return True
    return False
