from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.auth import authenticate_user, create_access_token, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(body: LoginRequest):
    user = authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id":    user["user_id"],
            "name":  user["name"],
            "role":  user["role"],
            "email": user["email"],
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "id":    current_user["user_id"],
        "name":  current_user["name"],
        "role":  current_user["role"],
        "email": current_user["email"],
    }
