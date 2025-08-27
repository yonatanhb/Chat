from sqlalchemy.orm import Session
from typing import List

from ..db import models, schemas


def create_chat_message(db: Session, message: schemas.MessageCreate, chat_id: int, sender_id: int) -> List[models.Message]:
    created_messages: list[models.Message] = []
    if message.items:
        for it in message.items:
            rec = models.Message(
                chat_id=chat_id,
                sender_id=sender_id,
                recipient_id=it.recipient_id,
                content=None,
                content_type=message.content_type,
                ciphertext=it.ciphertext,
                nonce=it.nonce,
                algo=it.algo,
            )
            db.add(rec)
            db.flush()
            created_messages.append(rec)
        db.commit()
        for m in created_messages:
            db.refresh(m)
        return created_messages
    else:
        derived_type = message.content_type
        attachment_id = getattr(message, 'attachment_id', None)
        if attachment_id:
            att = db.query(models.Attachment).get(attachment_id)
            if att:
                if att.mime_type.startswith('image/'):
                    derived_type = 'image'
                elif att.mime_type.startswith('video/'):
                    derived_type = 'video'
                else:
                    derived_type = 'file'
        db_message = models.Message(
            chat_id=chat_id,
            sender_id=sender_id,
            content=message.content,
            content_type=derived_type,
            ciphertext=message.ciphertext,
            nonce=message.nonce,
            algo=message.algo,
            attachment_id=attachment_id,
        )
        db.add(db_message)
        db.commit()
        db.refresh(db_message)
        return [db_message]


