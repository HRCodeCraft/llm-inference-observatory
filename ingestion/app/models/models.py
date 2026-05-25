import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Float, Integer, Boolean, DateTime,
    ForeignKey, Enum as SAEnum, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ConversationStatus(str, enum.Enum):
    active = "active"
    cancelled = "cancelled"
    completed = "completed"


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class InferenceStatus(str, enum.Enum):
    success = "success"
    error = "error"
    cancelled = "cancelled"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String(255), nullable=False, index=True)
    title = Column(String(60), nullable=True)
    provider = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    status = Column(SAEnum(ConversationStatus), nullable=False, default=ConversationStatus.active)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    message_count = Column(Integer, default=0, nullable=False)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    inference_logs = relationship("InferenceLog", back_populates="conversation", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_conversations_session_id", "session_id"),
        Index("ix_conversations_updated_at", "updated_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    role = Column(SAEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    content_preview = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sequence_number = Column(Integer, nullable=False, default=0)

    conversation = relationship("Conversation", back_populates="messages")
    inference_log = relationship("InferenceLog", back_populates="message", uselist=False)

    __table_args__ = (
        Index("ix_messages_conversation_id", "conversation_id"),
        Index("ix_messages_sequence", "conversation_id", "sequence_number"),
    )


class InferenceLog(Base):
    __tablename__ = "inference_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    provider = Column(String(100), nullable=False)
    model = Column(String(100), nullable=False)
    latency_ms = Column(Float, nullable=True)
    prompt_tokens = Column(Integer, nullable=True, default=0)
    completion_tokens = Column(Integer, nullable=True, default=0)
    total_tokens = Column(Integer, nullable=True, default=0)
    status = Column(SAEnum(InferenceStatus), nullable=False, default=InferenceStatus.success)
    error_message = Column(Text, nullable=True)
    request_timestamp = Column(DateTime(timezone=True), nullable=True)
    response_timestamp = Column(DateTime(timezone=True), nullable=True)
    input_preview = Column(String(200), nullable=True)
    output_preview = Column(String(200), nullable=True)
    stream = Column(Boolean, default=False, nullable=False)

    conversation = relationship("Conversation", back_populates="inference_logs")
    message = relationship("Message", back_populates="inference_log")

    __table_args__ = (
        Index("ix_inference_logs_conversation_id", "conversation_id"),
        Index("ix_inference_logs_request_timestamp", "request_timestamp"),
        Index("ix_inference_logs_provider", "provider"),
    )
