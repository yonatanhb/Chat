from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from ..database import Base


class UserChatState(Base):
    __tablename__ = "user_chat_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    last_read_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "chat_id", name="uq_user_chat_state"),
    )


