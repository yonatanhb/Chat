import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from ..database import Base


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    nonce = Column(String, nullable=False)
    algo = Column(String, default="AES-GCM", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))


