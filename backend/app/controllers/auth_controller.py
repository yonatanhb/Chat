from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core import security as auth
from ..db import models, schemas
from .users_controller import get_user_by_username, create_user
from .keys_controller import upsert_user_public_key
import asyncio
import json
from ..ws.ws_manager import manager


async def register_user(db: Session, body: schemas.RegisterIn):
    existing = get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=400, detail="שם המשתמש כבר קיים")
    if not all([body.username.strip(), body.first_name.strip(), body.last_name.strip(), body.password.strip(), body.public_key_jwk.strip()]):
        raise HTTPException(status_code=400, detail="כל השדות נדרשים")
    user = create_user(db, schemas.UserCreate(
        username=body.username,
        password=body.password,
        role="user",
        first_name=body.first_name,
        last_name=body.last_name,
    ))
    upsert_user_public_key(db, user.id, body.public_key_jwk, body.algorithm)
    try:
        # notify all unified WS clients to refresh users list / presence
        await manager.unified_broadcast_all(json.dumps({"v": 1, "type": "users_changed"}))
    except Exception:
        pass
    # Do not return JWT on registration; just a success acknowledgement
    return {"success": True}


async def login_with_key(db: Session, body: schemas.LoginWithKeyIn):
    rec = db.query(models.UserPublicKey).filter(models.UserPublicKey.public_key_jwk == body.public_key_jwk).first()
    if not rec:
        raise HTTPException(status_code=401, detail="Key not recognized")
    user = db.query(models.User).get(rec.user_id)
    if not user or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Bad credentials")
    token = auth.create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


