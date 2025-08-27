from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import schemas, models
from ..deps.db import get_db
from ..deps.auth import get_current_user
from ..controllers import keys_controller

router = APIRouter()


@router.post("/crypto/public-key", response_model=schemas.PublicKeyOut)
def upsert_public_key(body: schemas.PublicKeyIn, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    rec = keys_controller.upsert_user_public_key(db, current_user.id, body.public_key_jwk, body.algorithm)
    return schemas.PublicKeyOut(user_id=rec.user_id, public_key_jwk=rec.public_key_jwk, algorithm=rec.algorithm)


@router.get("/crypto/public-key/{user_id}", response_model=schemas.PublicKeyOut)
def get_public_key(user_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    rec = keys_controller.get_user_public_key(db, user_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    return schemas.PublicKeyOut(user_id=rec.user_id, public_key_jwk=rec.public_key_jwk, algorithm=rec.algorithm)


@router.post("/crypto/group-key/wrap", response_model=schemas.GroupKeyWrapOut)
def publish_group_key_wrap(body: schemas.GroupKeyWrapIn, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(body.chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    rec = keys_controller.upsert_group_key_share(
        db,
        chat_id=body.chat_id,
        provider_user_id=current_user.id,
        recipient_user_id=body.recipient_user_id,
        wrapped_key_ciphertext=body.wrapped_key_ciphertext,
        wrapped_key_nonce=body.wrapped_key_nonce,
        algorithm=body.algo,
    )
    return schemas.GroupKeyWrapOut(
        chat_id=rec.chat_id,
        provider_user_id=rec.provider_user_id,
        recipient_user_id=rec.recipient_user_id,
        wrapped_key_ciphertext=rec.wrapped_key_ciphertext,
        wrapped_key_nonce=rec.wrapped_key_nonce,
        algo=rec.algo,
    )


@router.get("/crypto/group-key/wrap/{chat_id}", response_model=schemas.GroupKeyWrapOut)
def get_group_key_wrap(chat_id: int, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    chat = db.query(models.Chat).get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if current_user.id not in [u.id for u in chat.participants]:
        raise HTTPException(status_code=403, detail="Forbidden")
    rec = keys_controller.get_group_key_share(db, chat_id, current_user.id)
    if not rec:
        raise HTTPException(status_code=404, detail="Not found")
    return schemas.GroupKeyWrapOut(
        chat_id=rec.chat_id,
        provider_user_id=rec.provider_user_id,
        recipient_user_id=rec.recipient_user_id,
        wrapped_key_ciphertext=rec.wrapped_key_ciphertext,
        wrapped_key_nonce=rec.wrapped_key_nonce,
        algo=rec.algo,
    )


