from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class IngestLogRequest(BaseModel):
    conversation_id: str
    session_id: str
    provider: str
    model: str
    latency_ms: Optional[float] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    status: str = "success"
    error_message: Optional[str] = None
    request_timestamp: Optional[str] = None
    response_timestamp: Optional[str] = None
    input_preview: Optional[str] = None
    output_preview: Optional[str] = None
    stream: bool = False
    role_user_message: Optional[str] = None
    role_assistant_message: Optional[str] = None


class ConversationOut(BaseModel):
    id: uuid.UUID
    session_id: str
    title: Optional[str]
    provider: str
    model: str
    status: str
    message_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    content_preview: Optional[str]
    created_at: datetime
    sequence_number: int

    model_config = {"from_attributes": True}


class ConversationDetailOut(ConversationOut):
    messages: List[MessageOut] = []


class InferenceLogOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    message_id: Optional[uuid.UUID]
    provider: str
    model: str
    latency_ms: Optional[float]
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    status: str
    error_message: Optional[str]
    request_timestamp: Optional[datetime]
    response_timestamp: Optional[datetime]
    input_preview: Optional[str]
    output_preview: Optional[str]
    stream: bool

    model_config = {"from_attributes": True}


class ProviderBreakdown(BaseModel):
    provider: str
    count: int
    avg_latency: Optional[float]


class ModelBreakdown(BaseModel):
    model: str
    count: int


class HourlyVolume(BaseModel):
    hour: str
    count: int


class MetricsSummary(BaseModel):
    total_conversations: int
    total_messages: int
    total_tokens: int
    avg_latency_ms: Optional[float]
    error_rate: float
    provider_breakdown: List[ProviderBreakdown]
    model_breakdown: List[ModelBreakdown]
    hourly_volume: List[HourlyVolume]
    p50_latency: Optional[float]
    p95_latency: Optional[float]
    p99_latency: Optional[float]


class TimeseriesPoint(BaseModel):
    timestamp: str
    value: float


class ModelCostBreakdown(BaseModel):
    provider: str
    model: str
    total_tokens: int
    call_count: int
    estimated_cost_usd: float
    avg_latency_ms: Optional[float]
    cost_per_1k_tokens: float


class CostSummary(BaseModel):
    total_estimated_usd: float
    projected_monthly_usd: float
    days_of_data: int
    by_model: List[ModelCostBreakdown]
    most_used_model: Optional[str]
    cheapest_model: Optional[str]
    best_efficiency_model: Optional[str]  # lowest cost per ms of latency


class APIResponse(BaseModel):
    success: bool
    data: Optional[object] = None
    error: Optional[str] = None
