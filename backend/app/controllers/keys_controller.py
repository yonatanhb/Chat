from sqlalchemy.orm import Session

from ..db import models


def upsert_user_public_key(db: Session, user_id: int, public_key_jwk: str, algorithm: str):
    rec = db.query(models.UserPublicKey).filter(models.UserPublicKey.user_id == user_id).first()
    if rec:
        rec.public_key_jwk = public_key_jwk
        rec.algorithm = algorithm
    else:
        rec = models.UserPublicKey(user_id=user_id, public_key_jwk=public_key_jwk, algorithm=algorithm)
        db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def get_user_public_key(db: Session, user_id: int):
    return db.query(models.UserPublicKey).filter(models.UserPublicKey.user_id == user_id).first()


def upsert_group_key_share(db: Session, chat_id: int, provider_user_id: int, recipient_user_id: int, wrapped_key_ciphertext: str, wrapped_key_nonce: str, algorithm: str):
    rec = (
        db.query(models.GroupKeyShare)
        .filter(models.GroupKeyShare.chat_id == chat_id, models.GroupKeyShare.recipient_user_id == recipient_user_id)
        .first()
    )
    if rec:
        rec.wrapped_key_ciphertext = wrapped_key_ciphertext
        rec.wrapped_key_nonce = wrapped_key_nonce
        rec.algo = algorithm
    else:
        rec = models.GroupKeyShare(
            chat_id=chat_id,
            provider_user_id=provider_user_id,
            recipient_user_id=recipient_user_id,
            wrapped_key_ciphertext=wrapped_key_ciphertext,
            wrapped_key_nonce=wrapped_key_nonce,
            algo=algorithm,
        )
        db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


def get_group_key_share(db: Session, chat_id: int, recipient_user_id: int):
    return (
        db.query(models.GroupKeyShare)
        .filter(models.GroupKeyShare.chat_id == chat_id, models.GroupKeyShare.recipient_user_id == recipient_user_id)
        .first()
    )


