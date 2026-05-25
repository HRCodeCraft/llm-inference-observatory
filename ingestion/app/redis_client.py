import os
import json
import logging
import redis.asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CHANNEL = "inference_events"

_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        logger.info("Creating Redis connection pool: url=%s", REDIS_URL)
        _pool = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _pool


async def publish_event(event: dict) -> None:
    try:
        r = get_redis()
        await r.publish(CHANNEL, json.dumps(event, default=str))
        logger.debug(
            "Published event: channel=%s type=%s conv_id=%s",
            CHANNEL, event.get("type"), str(event.get("conversation_id", ""))[:8],
        )
    except Exception as e:
        logger.error("Redis publish failed: channel=%s error=%s", CHANNEL, e)


async def close_redis() -> None:
    global _pool
    if _pool:
        logger.info("Closing Redis connection pool")
        await _pool.aclose()
        _pool = None
