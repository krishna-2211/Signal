from datetime import datetime, timedelta, timezone
from typing import Optional
import warnings

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

warnings.filterwarnings("ignore", category=UserWarning)

SECRET_KEY = "signal-secret-key-2026"
ALGORITHM = "HS256"
TOKEN_EXPIRY_MINUTES = 480

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

USERS: dict[str, dict] = {
    "sarah.mitchell@signal.com": {
        "email":         "sarah.mitchell@signal.com",
        "hashed_password": "$2b$12$sqsRUCJeZ5o1Mbpc/NDYPOmADneIZwccbKBweIBtXdtvgSgP1ubjW",
        "user_id":       "rm_001",
        "role":          "rm",
        "name":          "Sarah Mitchell",
    },
    "james.okafor@signal.com": {
        "email":         "james.okafor@signal.com",
        "hashed_password": "$2b$12$dW7LwRb6ImxFbAhGMJ5vSe7voqZcxh3kc3abfa.z79KbLDeZ/7T3q",
        "user_id":       "rm_002",
        "role":          "rm",
        "name":          "James Okafor",
    },
    "priya.nair@signal.com": {
        "email":         "priya.nair@signal.com",
        "hashed_password": "$2b$12$I.5fpljkz2vsA/YYfP.CJO3CqU5ecbNjztNmn2kOwzacCiEsVqbEK",
        "user_id":       "rm_003",
        "role":          "rm",
        "name":          "Priya Nair",
    },
    "marcus.webb@signal.com": {
        "email":         "marcus.webb@signal.com",
        "hashed_password": "$2b$12$i/rM94aGfUsbHqaIRlJgvO/MSUIWAWOlwD4Lzeoo8F3sktg5j0EEK",
        "user_id":       "risk_001",
        "role":          "risk",
        "name":          "Marcus Webb",
    },
}


def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = USERS.get(email)
    if not user:
        return None
    try:
        if not pwd_context.verify(password, user["hashed_password"]):
            return None
    except Exception:
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
