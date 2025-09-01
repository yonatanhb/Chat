from sqlalchemy.orm import Session
from typing import Optional

from ..db import models, schemas
from ..core.security import get_password_hash


def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        password_hash=hashed_password,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        # signup_ip and signup_at will be set to None by default
        # These fields are typically set by the system, not during user creation
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    # Auto-create self-chat (private with only this user)
    try:
        self_chat = models.Chat(chat_type="private")
        db.add(self_chat)
        db.commit()
        db.refresh(self_chat)
        self_chat.participants.append(db_user)
        db.commit()
        db.refresh(self_chat)
    except Exception:
        db.rollback()
    return db_user


def list_users(db: Session):
    return db.query(models.User).all()


def update_user(db: Session, user_id: int, data: schemas.UserUpdate):
    u = get_user(db, user_id)
    if not u:
        return None
    if data.first_name is not None:
        u.first_name = data.first_name
    if data.last_name is not None:
        u.last_name = data.last_name
    if data.role is not None:
        u.role = data.role
    if data.password:
        u.password_hash = get_password_hash(data.password)
    db.commit()
    db.refresh(u)
    return u


def delete_user(db: Session, user_id: int):
    u = get_user(db, user_id)
    if not u:
        return False
    db.delete(u)
    db.commit()
    return True


def get_or_create_user(db: Session, username: str, default_password: str = "123456"):
    u = get_user_by_username(db, username)
    if u:
        return u
    user_create = schemas.UserCreate(username=username, password=default_password, role="user")
    return create_user(db, user_create)


