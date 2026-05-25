import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.redis_client import get_redis, CHANNEL

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

_active_connections = 0


@router.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    global _active_connections
    await websocket.accept()
    _active_connections += 1
    client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info("WebSocket connected: client=%s active_connections=%d", client, _active_connections)

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL)
    logger.debug("Subscribed to Redis channel=%s", CHANNEL)

    events_forwarded = 0
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                events_forwarded += 1
                logger.debug("Forwarding event #%d to client=%s", events_forwarded, client)
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        logger.info(
            "WebSocket disconnected: client=%s forwarded=%d events",
            client, events_forwarded,
        )
    except Exception as e:
        logger.error("WebSocket error: client=%s error=%s", client, e)
    finally:
        _active_connections -= 1
        logger.info("WebSocket cleanup: client=%s active_connections=%d", client, _active_connections)
        await pubsub.unsubscribe(CHANNEL)
        await pubsub.aclose()
