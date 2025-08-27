from sqlalchemy.orm import Session

from ..db import models, schemas
from .users_controller import get_user


def get_chat(db: Session, chat_id: int):
    return db.query(models.Chat).filter(models.Chat.id == chat_id).first()


def get_chats_for_user(db: Session, user_id: int):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user.chats if user else []


def create_chat(db: Session, chat: schemas.ChatCreate, creator_id: int):
    db_chat = models.Chat(chat_type=chat.chat_type, name=chat.name, admin_user_id=creator_id if chat.chat_type == 'group' else None)
    db.add(db_chat)
    db.commit()
    db.refresh(db_chat)

    all_participant_ids = set([creator_id] + chat.participant_ids)
    for user_id in all_participant_ids:
        user = get_user(db, user_id)
        if user:
            db_chat.participants.append(user)
    db.commit()
    db.refresh(db_chat)
    return db_chat


def add_members(db: Session, chat_id: int, member_ids: list[int]):
    chat = get_chat(db, chat_id)
    if not chat:
        return None
    for uid in member_ids:
        user = get_user(db, uid)
        if user and user not in chat.participants:
            chat.participants.append(user)
    db.commit()
    db.refresh(chat)
    return chat


def remove_members(db: Session, chat_id: int, member_ids: list[int]):
    chat = get_chat(db, chat_id)
    if not chat:
        return None
    chat.participants = [u for u in chat.participants if u.id not in set(member_ids)]
    db.commit()
    db.refresh(chat)
    return chat


def get_or_create_chat(db: Session, chat_id: int, chat_type: str = "group"):
    chat = db.query(models.Chat).filter(models.Chat.id == chat_id).first()
    if not chat:
        chat = models.Chat(chat_type=chat_type)
        db.add(chat)
        db.commit()
        db.refresh(chat)
    return chat


