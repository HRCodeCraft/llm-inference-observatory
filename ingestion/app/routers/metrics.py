import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.database import get_db
from app.models import Conversation, Message, InferenceLog, InferenceStatus
from app.schemas import (
    MetricsSummary, ProviderBreakdown, ModelBreakdown,
    HourlyVolume, TimeseriesPoint, APIResponse,
    CostSummary, ModelCostBreakdown,
)

# Pricing per 1M tokens (blended input+output estimate, approximate public rates)
MODEL_PRICING_PER_1M: dict[str, float] = {
    "gpt-4.1":              5.00,   # $2 input / $8 output, ~50/50 blend
    "gpt-4o":               3.75,
    "gpt-4o-mini":          0.30,
    "claude-opus-4-5":     30.00,   # $15 input / $75 output
    "claude-sonnet-4-5":    9.00,   # $3 input / $15 output
    "claude-haiku-4-5":     1.00,
    "gemini-2.0-flash":     0.19,   # $0.075 input / $0.30 output
    "gemini-1.5-pro":       3.50,
    "deepseek-chat":        0.69,   # $0.27 input / $1.10 output
    "deepseek-coder":       0.69,
    "grok-2-latest":        6.00,   # $2 input / $10 output
    "grok-beta":            6.00,
}
DEFAULT_PRICING_PER_1M = 5.00  # fallback for unknown models


def _price_for_model(model: str) -> float:
    return MODEL_PRICING_PER_1M.get(model.lower(), DEFAULT_PRICING_PER_1M)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])
logger = logging.getLogger(__name__)


def _percentile(values: list[float], p: float) -> Optional[float]:
    if not values:
        return None
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    # Nearest-rank method: percentile index is ceil(p/100 * n) - 1
    rank = max(1, int(round(p / 100.0 * n + 0.5)))
    return round(sorted_vals[min(rank - 1, n - 1)], 2)


@router.get("/summary", response_model=APIResponse)
async def get_metrics_summary(db: AsyncSession = Depends(get_db)):
    try:
        total_convs = await db.scalar(select(func.count()).select_from(Conversation))
        total_msgs = await db.scalar(select(func.count()).select_from(Message))

        token_result = await db.scalar(
            select(func.coalesce(func.sum(InferenceLog.total_tokens), 0))
        )
        total_tokens = int(token_result or 0)

        avg_lat = await db.scalar(
            select(func.avg(InferenceLog.latency_ms))
            .where(InferenceLog.latency_ms.isnot(None))
        )

        total_logs = await db.scalar(select(func.count()).select_from(InferenceLog))
        error_logs = await db.scalar(
            select(func.count()).select_from(InferenceLog)
            .where(InferenceLog.status == InferenceStatus.error)
        )
        error_rate = round((error_logs / total_logs * 100) if total_logs else 0.0, 2)

        provider_rows = await db.execute(
            select(
                InferenceLog.provider,
                func.count().label("count"),
                func.avg(InferenceLog.latency_ms).label("avg_latency"),
            ).group_by(InferenceLog.provider)
        )
        provider_breakdown = [
            ProviderBreakdown(provider=r.provider, count=r.count, avg_latency=r.avg_latency)
            for r in provider_rows
        ]

        model_rows = await db.execute(
            select(
                InferenceLog.model,
                func.count().label("count"),
            ).group_by(InferenceLog.model)
        )
        model_breakdown = [
            ModelBreakdown(model=r.model, count=r.count)
            for r in model_rows
        ]

        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        hourly_rows = await db.execute(
            select(
                func.date_trunc("hour", InferenceLog.request_timestamp).label("hour"),
                func.count().label("count"),
            )
            .where(InferenceLog.request_timestamp >= cutoff)
            .group_by("hour")
            .order_by("hour")
        )
        hourly_volume = [
            HourlyVolume(hour=str(r.hour), count=r.count)
            for r in hourly_rows
        ]

        lat_rows = await db.execute(
            select(InferenceLog.latency_ms)
            .where(InferenceLog.latency_ms.isnot(None))
        )
        latencies = [r[0] for r in lat_rows if r[0] is not None]

        summary = MetricsSummary(
            total_conversations=total_convs or 0,
            total_messages=total_msgs or 0,
            total_tokens=total_tokens,
            avg_latency_ms=round(avg_lat, 2) if avg_lat else None,
            error_rate=error_rate,
            provider_breakdown=provider_breakdown,
            model_breakdown=model_breakdown,
            hourly_volume=hourly_volume,
            p50_latency=_percentile(latencies, 50),
            p95_latency=_percentile(latencies, 95),
            p99_latency=_percentile(latencies, 99),
        )
        return APIResponse(success=True, data=summary.model_dump())
    except Exception as e:
        logger.exception("Metrics summary error")
        return APIResponse(success=False, error=str(e))


@router.get("/timeseries", response_model=APIResponse)
async def get_timeseries(
    metric: str = Query("latency", pattern="^(latency|tokens|errors)$"),
    interval: str = Query("24h", pattern="^(1h|6h|24h|7d)$"),
    db: AsyncSession = Depends(get_db),
):
    try:
        interval_map = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}
        hours = interval_map[interval]
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        trunc = "hour" if hours <= 24 else "day"

        if metric == "latency":
            rows = await db.execute(
                select(
                    func.date_trunc(trunc, InferenceLog.request_timestamp).label("ts"),
                    func.avg(InferenceLog.latency_ms).label("value"),
                )
                .where(InferenceLog.request_timestamp >= cutoff)
                .group_by("ts")
                .order_by("ts")
            )
        elif metric == "tokens":
            rows = await db.execute(
                select(
                    func.date_trunc(trunc, InferenceLog.request_timestamp).label("ts"),
                    func.sum(InferenceLog.total_tokens).label("value"),
                )
                .where(InferenceLog.request_timestamp >= cutoff)
                .group_by("ts")
                .order_by("ts")
            )
        else:
            rows = await db.execute(
                select(
                    func.date_trunc(trunc, InferenceLog.request_timestamp).label("ts"),
                    func.count().label("value"),
                )
                .where(
                    InferenceLog.request_timestamp >= cutoff,
                    InferenceLog.status == InferenceStatus.error,
                )
                .group_by("ts")
                .order_by("ts")
            )

        points = [
            TimeseriesPoint(timestamp=str(r.ts), value=float(r.value or 0))
            for r in rows
        ]
        return APIResponse(success=True, data=[p.model_dump() for p in points])
    except Exception as e:
        logger.exception("Timeseries error")
        return APIResponse(success=False, error=str(e))


@router.get("/cost", response_model=APIResponse)
async def get_cost_summary(db: AsyncSession = Depends(get_db)):
    """
    Estimate dollar cost for every model used, ranked by spend.
    Pricing is a blended input/output approximation from public provider rate cards.
    """
    try:
        rows = await db.execute(
            select(
                InferenceLog.provider,
                InferenceLog.model,
                func.sum(InferenceLog.total_tokens).label("total_tokens"),
                func.count().label("call_count"),
                func.avg(InferenceLog.latency_ms).label("avg_latency_ms"),
                func.min(InferenceLog.request_timestamp).label("earliest"),
            )
            .group_by(InferenceLog.provider, InferenceLog.model)
            .order_by(func.sum(InferenceLog.total_tokens).desc())
        )
        all_rows = rows.all()

        if not all_rows:
            return APIResponse(success=True, data=CostSummary(
                total_estimated_usd=0,
                projected_monthly_usd=0,
                days_of_data=0,
                by_model=[],
                most_used_model=None,
                cheapest_model=None,
                best_efficiency_model=None,
            ).model_dump())

        # Determine date span for monthly projection
        earliest_ts = min(r.earliest for r in all_rows if r.earliest)
        days_of_data = max(
            1,
            (datetime.now(timezone.utc) - earliest_ts.replace(tzinfo=timezone.utc)).days + 1
        )

        by_model: list[ModelCostBreakdown] = []
        for r in all_rows:
            tokens = int(r.total_tokens or 0)
            price_per_1m = _price_for_model(r.model)
            cost_usd = round(tokens / 1_000_000 * price_per_1m, 6)
            by_model.append(ModelCostBreakdown(
                provider=r.provider,
                model=r.model,
                total_tokens=tokens,
                call_count=int(r.call_count),
                estimated_cost_usd=cost_usd,
                avg_latency_ms=round(r.avg_latency_ms, 2) if r.avg_latency_ms else None,
                cost_per_1k_tokens=round(price_per_1m / 1000, 6),
            ))

        total_usd = round(sum(m.estimated_cost_usd for m in by_model), 6)
        projected_monthly = round(total_usd / days_of_data * 30, 4)

        # Most used = highest token count (already sorted desc)
        most_used = by_model[0].model if by_model else None

        # Cheapest = lowest cost_per_1k_tokens among models actually used
        cheapest = min(by_model, key=lambda m: m.cost_per_1k_tokens).model if by_model else None

        # Best efficiency = lowest cost per ms of average latency (value for money)
        efficiency_candidates = [m for m in by_model if m.avg_latency_ms and m.avg_latency_ms > 0]
        best_efficiency = (
            min(efficiency_candidates, key=lambda m: m.cost_per_1k_tokens / (1000 / m.avg_latency_ms)).model
            if efficiency_candidates else None
        )

        summary = CostSummary(
            total_estimated_usd=total_usd,
            projected_monthly_usd=projected_monthly,
            days_of_data=days_of_data,
            by_model=by_model,
            most_used_model=most_used,
            cheapest_model=cheapest,
            best_efficiency_model=best_efficiency,
        )
        return APIResponse(success=True, data=summary.model_dump())
    except Exception as e:
        logger.exception("Cost summary error")
        return APIResponse(success=False, error=str(e))
