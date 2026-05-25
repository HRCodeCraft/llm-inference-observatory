import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Conversation, Message, InferenceLog, ConversationStatus
from app.schemas import ConversationOut, ConversationDetailOut, MessageOut, APIResponse


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None

router = APIRouter(prefix="/api/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)


@router.get("", response_model=APIResponse)
async def list_conversations(db: AsyncSession = Depends(get_db)):
    logger.debug("Listing conversations")
    try:
        result = await db.execute(
            select(Conversation).order_by(Conversation.updated_at.desc())
        )
        convs = result.scalars().all()
        data = [ConversationOut.model_validate(c) for c in convs]
        logger.debug("Returning %d conversations", len(data))
        return APIResponse(success=True, data=[d.model_dump() for d in data])
    except Exception as e:
        logger.exception("List conversations failed: %s", e)
        return APIResponse(success=False, error=str(e))


@router.get("/{conv_id}", response_model=APIResponse)
async def get_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    logger.debug("Get conversation conv_id=%s", conv_id[:8])
    try:
        cid = uuid.UUID(conv_id)
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == cid)
        )
        conv = result.scalar_one_or_none()
        if not conv:
            logger.warning("Conversation not found: conv_id=%s", conv_id[:8])
            return APIResponse(success=False, error="Conversation not found")
        msgs = sorted(conv.messages, key=lambda m: m.sequence_number)
        logger.debug("Found conversation conv_id=%s with %d messages", conv_id[:8], len(msgs))
        out = ConversationDetailOut.model_validate(conv)
        out.messages = [MessageOut.model_validate(m) for m in msgs]
        return APIResponse(success=True, data=out.model_dump())
    except Exception as e:
        logger.exception("Get conversation failed: conv_id=%s error=%s", conv_id[:8], e)
        return APIResponse(success=False, error=str(e))


@router.get("/{conv_id}/messages", response_model=APIResponse)
async def get_messages(conv_id: str, db: AsyncSession = Depends(get_db)):
    logger.debug("Get messages conv_id=%s", conv_id[:8])
    try:
        cid = uuid.UUID(conv_id)
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == cid)
            .order_by(Message.sequence_number)
        )
        msgs = result.scalars().all()
        data = [MessageOut.model_validate(m) for m in msgs]
        logger.debug("Returning %d messages for conv_id=%s", len(data), conv_id[:8])
        return APIResponse(success=True, data=[d.model_dump() for d in data])
    except Exception as e:
        logger.exception("Get messages failed: conv_id=%s error=%s", conv_id[:8], e)
        return APIResponse(success=False, error=str(e))


@router.patch("/{conv_id}", response_model=APIResponse)
async def update_conversation(conv_id: str, body: UpdateConversationRequest, db: AsyncSession = Depends(get_db)):
    logger.info("Update conversation conv_id=%s title=%r", conv_id[:8], body.title)
    try:
        cid = uuid.UUID(conv_id)
        values: dict = {"updated_at": datetime.now(timezone.utc)}
        if body.title is not None:
            values["title"] = body.title[:60].strip() or None
        await db.execute(update(Conversation).where(Conversation.id == cid).values(**values))
        await db.commit()
        result = await db.execute(select(Conversation).where(Conversation.id == cid))
        conv = result.scalar_one_or_none()
        if not conv:
            logger.warning("Conversation not found for update: conv_id=%s", conv_id[:8])
            return APIResponse(success=False, error="Not found")
        logger.info("Conversation updated: conv_id=%s", conv_id[:8])
        return APIResponse(success=True, data=ConversationOut.model_validate(conv).model_dump())
    except Exception as e:
        logger.exception("Update conversation failed: conv_id=%s error=%s", conv_id[:8], e)
        await db.rollback()
        return APIResponse(success=False, error=str(e))


@router.delete("/{conv_id}", response_model=APIResponse)
async def delete_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    logger.info("Delete conversation conv_id=%s", conv_id[:8])
    try:
        cid = uuid.UUID(conv_id)
        result = await db.execute(select(Conversation).where(Conversation.id == cid))
        conv = result.scalar_one_or_none()
        if not conv:
            logger.warning("Conversation not found for delete: conv_id=%s", conv_id[:8])
            return APIResponse(success=False, error="Conversation not found")
        await db.execute(delete(Conversation).where(Conversation.id == cid))
        await db.commit()
        logger.info("Conversation deleted: conv_id=%s", conv_id[:8])
        return APIResponse(success=True, data={"deleted": conv_id})
    except Exception as e:
        logger.exception("Delete conversation failed: conv_id=%s error=%s", conv_id[:8], e)
        await db.rollback()
        return APIResponse(success=False, error=str(e))


@router.patch("/{conv_id}/cancel", response_model=APIResponse)
async def cancel_conversation(conv_id: str, db: AsyncSession = Depends(get_db)):
    logger.info("Cancel conversation conv_id=%s", conv_id[:8])
    try:
        cid = uuid.UUID(conv_id)
        await db.execute(
            update(Conversation)
            .where(Conversation.id == cid)
            .values(status=ConversationStatus.cancelled, updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        result = await db.execute(select(Conversation).where(Conversation.id == cid))
        conv = result.scalar_one_or_none()
        if not conv:
            logger.warning("Conversation not found after cancel: conv_id=%s", conv_id[:8])
            return APIResponse(success=False, error="Not found")
        logger.info("Conversation cancelled: conv_id=%s", conv_id[:8])
        return APIResponse(success=True, data=ConversationOut.model_validate(conv).model_dump())
    except Exception as e:
        logger.exception("Cancel conversation failed: conv_id=%s error=%s", conv_id[:8], e)
        await db.rollback()
        return APIResponse(success=False, error=str(e))
