from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = "signal-secret-key-2026"
ALGORITHM = "HS256"
TOKEN_EXPIRY_MINUTES = 480

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Pre-hashed bcrypt passwords
USERS: dict[str, dict] = {
    "sarah.mitchell@signal.com": {
        "email":         "sarah.mitchell@signal.com",
        "hashed_password": "$2b$12$uGaY2RAbQs9zUyGFRcfWIuO5qE/bIdBIpG1E45dkEWjiqL8ZMbn8u",
        "user_id":       "rm_001",
        "role":          "rm",
        "name":          "Sarah Mitchell",
    },
    "james.okafor@signal.com": {
        "email":         "james.okafor@signal.com",
        "hashed_password": "$2b$12$IUVRTWRzwLqi/ohgpIy0rO/VFnNfDuYP3INL7o1/65DlBQzBZzAVG",
        "user_id":       "rm_002",
        "role":          "rm",
        "name":          "James Okafor",
    },
    "priya.nair@signal.com": {
        "email":         "priya.nair@signal.com",
        "hashed_password": "$2b$12$D8xnPCBbSz522KqOoU7RTuI7QsuTa07Oda263T4/kSqaYrj0Spsua",
        "user_id":       "rm_003",
        "role":          "rm",
        "name":          "Priya Nair",
    },
    "marcus.webb@signal.com": {
        "email":         "marcus.webb@signal.com",
        "hashed_password": "$2b$12$rm4cNGRi5ggBOvXkpB8R3urXg8CzXMfmTF2zeUA7YupPpgKyRcggi",
        "user_id":       "risk_001",
        "role":          "risk",
        "name":          "Marcus Webb",
    },
}


def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = USERS.get(email)
    if not user:
        return None
    if not pwd_context.verify(password, user["hashed_password"]):
        return None
    return user


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    email: str = payload.get("sub")
    user = USERS.get(email) if email else None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
