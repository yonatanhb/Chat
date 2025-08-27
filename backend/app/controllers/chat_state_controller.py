from sqlalchemy.orm import Session
from typing import Optional

from ..db import models


def get_user_chat_state(db: Session, user_id: int, chat_id: int):
    return (
        db.query(models.UserChatState)
        .filter(models.UserChatState.user_id == user_id, models.UserChatState.chat_id == chat_id)
        .first()
    )


def upsert_user_chat_state(db: Session, user_id: int, chat_id: int, last_read_message_id: Optional[int]):
    state = get_user_chat_state(db, user_id, chat_id)
    if not state:
        state = models.UserChatState(user_id=user_id, chat_id=chat_id, last_read_message_id=last_read_message_id)
        db.add(state)
    else:
        state.last_read_message_id = last_read_message_id
    db.commit()
    db.refresh(state)
    return state


