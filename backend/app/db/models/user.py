from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from ..database import Base
from .association import chat_users_table
from .message import Message


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    signup_ip = Column(String, nullable=True)
    signup_at = Column(DateTime, nullable=True)

    sent_messages = relationship(
        "Message",
        foreign_keys=[Message.sender_id],
        back_populates="sender",
    )
    received_messages = relationship(
        "Message",
        foreign_keys=[Message.recipient_id],
        back_populates="recipient",
    )
    chats = relationship("Chat", secondary=chat_users_table, back_populates="participants")


