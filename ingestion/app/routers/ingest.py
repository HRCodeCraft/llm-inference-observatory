import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.database import get_db
from app.models import Conversation, Message, InferenceLog, ConversationStatus, MessageRole, InferenceStatus
from app.schemas import IngestLogRequest, APIResponse
from app.utils.pii_redactor import preview, redact
from app.redis_client import publish_event

router = APIRouter(prefix="/api/ingest", tags=["ingest"])
logger = logging.getLogger(__name__)


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


@router.post("/log", response_model=APIResponse)
async def ingest_log(payload: IngestLogRequest, db: AsyncSession = Depends(get_db)):
    logger.info(
        "Ingest request: provider=%s model=%s conv_id=%s session=%s tokens=%d latency=%.0fms status=%s stream=%s",
        payload.provider, payload.model,
        payload.conversation_id[:8], payload.session_id[:8],
        payload.total_tokens, payload.latency_ms or 0,
        payload.status, payload.stream,
    )

    try:
        conv_id = uuid.UUID(payload.conversation_id)
    except ValueError:
        logger.warning("Invalid conversation_id %r — generating new UUID", payload.conversation_id)
        conv_id = uuid.uuid4()

    try:
        result = await db.execute(select(Conversation).where(Conversation.id == conv_id))
        conversation = result.scalar_one_or_none()

        title = None
        if payload.role_user_message:
            raw = payload.role_user_message[:60]
            title = redact(raw)

        if conversation is None:
            logger.debug("Creating new conversation conv_id=%s session=%s", conv_id, payload.session_id[:8])
            conversation = Conversation(
                id=conv_id,
                session_id=payload.session_id,
                title=title or f"Session {payload.session_id[:8]}",
                provider=payload.provider,
                model=payload.model,
                status=ConversationStatus.active,
                message_count=0,
            )
            db.add(conversation)
            await db.flush()
        else:
            logger.debug("Appending to existing conversation conv_id=%s msg_count=%d", conv_id, conversation.message_count)
            if title and not conversation.title:
                conversation.title = title

        seq_result = await db.execute(
            select(func.coalesce(func.max(Message.sequence_number), -1))
            .where(Message.conversation_id == conv_id)
        )
        max_seq = seq_result.scalar() or -1

        user_msg = None
        if payload.role_user_message:
            user_msg = Message(
                conversation_id=conv_id,
                role=MessageRole.user,
                content=payload.role_user_message,
                content_preview=preview(payload.role_user_message),
                sequence_number=max_seq + 1,
            )
            db.add(user_msg)
            await db.flush()
            max_seq += 1
            logger.debug("Inserted user message seq=%d conv_id=%s", max_seq, conv_id)

        assistant_msg = None
        if payload.role_assistant_message:
            assistant_msg = Message(
                conversation_id=conv_id,
                role=MessageRole.assistant,
                content=payload.role_assistant_message,
                content_preview=preview(payload.role_assistant_message),
                sequence_number=max_seq + 1,
            )
            db.add(assistant_msg)
            await db.flush()
            logger.debug("Inserted assistant message seq=%d conv_id=%s", max_seq + 1, conv_id)

        try:
            status = InferenceStatus(payload.status)
        except ValueError:
            logger.warning("Unknown status %r — defaulting to success", payload.status)
            status = InferenceStatus.success

        log = InferenceLog(
            conversation_id=conv_id,
            message_id=assistant_msg.id if assistant_msg else None,
            provider=payload.provider,
            model=payload.model,
            latency_ms=payload.latency_ms,
            prompt_tokens=payload.prompt_tokens,
            completion_tokens=payload.completion_tokens,
            total_tokens=payload.total_tokens,
            status=status,
            error_message=payload.error_message,
            request_timestamp=_parse_dt(payload.request_timestamp),
            response_timestamp=_parse_dt(payload.response_timestamp),
            input_preview=preview(payload.input_preview or payload.role_user_message or ""),
            output_preview=preview(payload.output_preview or payload.role_assistant_message or ""),
            stream=payload.stream,
        )
        db.add(log)

        msg_count_delta = (1 if user_msg else 0) + (1 if assistant_msg else 0)
        await db.execute(
            update(Conversation)
            .where(Conversation.id == conv_id)
            .values(
                message_count=Conversation.message_count + msg_count_delta,
                updated_at=datetime.now(timezone.utc),
            )
        )

        await db.commit()
        await db.refresh(log)
        logger.info(
            "Ingest committed: log_id=%s conv_id=%s provider=%s model=%s tokens=%d latency=%.0fms",
            log.id, conv_id, payload.provider, payload.model,
            payload.total_tokens, payload.latency_ms or 0,
        )

        event = {
            "type": "inference_log",
            "log_id": str(log.id),
            "conversation_id": str(conv_id),
            "provider": payload.provider,
            "model": payload.model,
            "latency_ms": payload.latency_ms,
            "total_tokens": payload.total_tokens,
            "status": status.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await publish_event(event)

        return APIResponse(success=True, data={"log_id": str(log.id)})

    except Exception as e:
        logger.exception(
            "Ingest failed: provider=%s model=%s conv_id=%s error=%s",
            payload.provider, payload.model, payload.conversation_id[:8], e,
        )
        await db.rollback()
        return APIResponse(success=False, error=str(e))
