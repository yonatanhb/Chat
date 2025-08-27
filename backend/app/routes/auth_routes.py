from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm

from ..core import security

from ..db import schemas
from ..controllers import users_controller
from ..deps.db import get_db
from ..controllers import auth_controller

router = APIRouter()


@router.post("/auth/register", response_model=schemas.Token)
async def register_user(body: schemas.RegisterIn, db: Session = Depends(get_db)):
    return await auth_controller.register_user(db, body)


@router.post("/auth/login-with-key", response_model=schemas.Token)
async def login_with_key(body: schemas.LoginWithKeyIn, db: Session = Depends(get_db)):
    return await auth_controller.login_with_key(db, body)


@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_controller.get_user_by_username(db, form_data.username)
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
    access_token = security.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}


