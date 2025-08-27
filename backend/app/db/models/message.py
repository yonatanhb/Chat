import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
from ..database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"))
    sender_id = Column(Integer, ForeignKey("users.id"))
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    content = Column(String, nullable=True)
    content_type = Column(
        Enum("text", "image", name="content_type_enum"),
        default="text",
        nullable=False,
    )
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    ciphertext = Column(Text, nullable=True)
    nonce = Column(String, nullable=True)
    algo = Column(String, nullable=True)
    attachment_id = Column(Integer, ForeignKey("attachments.id"), nullable=True)

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="received_messages")
    attachment = relationship("Attachment", foreign_keys=[attachment_id])


