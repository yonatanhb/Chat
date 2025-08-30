from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base


class PinnedChat(Base):
    __tablename__ = "pinned_chats"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    pinned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="pinned_chats")
    chat = relationship("Chat", back_populates="pinned_by_users")

    __table_args__ = (
        UniqueConstraint('user_id', 'chat_id', name='uq_user_chat_pin'),
    )
