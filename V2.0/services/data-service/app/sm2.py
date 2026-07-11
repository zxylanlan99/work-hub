"""SM-2 spaced-repetition algorithm (retained baseline, PRD §2.4 #3).

This is the server-side port of V1.x ``_sm2``. It is a pure function: it reads
the current SM-2 state off a review card and returns the next state given a
recall-quality score. The card's ``due_date`` is recomputed from ``now``.

The algorithm (SuperMemo 2):
  * quality q in 0..5 (0 = blackout, 5 = perfect recall).
  * if q >= 3 (correct):
        repetitions == 0 -> interval = 1
        repetitions == 1 -> interval = 6
        else             -> interval = round(interval * ease)
        repetitions += 1
    else (incorrect):
        repetitions = 0
        interval = 1
  * ease' = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)); clamp >= 1.3
  * due_date = now + interval days
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def apply_sm2(card: Any, quality: int) -> Dict[str, Any]:
    """Apply the SM-2 update for ``card`` given recall ``quality`` (0-5).

    Args:
        card: object exposing ``sm2_ease``, ``sm2_interval``,
            ``sm2_repetitions`` attributes (e.g. an ORM ``ReviewCard``).
        quality: recall quality, clamped to 0..5.

    Returns:
        dict with updated ``sm2_ease``, ``sm2_interval``, ``sm2_repetitions``,
        ``due_date``, ``last_reviewed_at``.
    """
    if quality < 0:
        quality = 0
    if quality > 5:
        quality = 5

    ease = float(getattr(card, "sm2_ease", 2.5))
    interval = int(getattr(card, "sm2_interval", 0))
    repetitions = int(getattr(card, "sm2_repetitions", 0))

    if quality >= 3:
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        repetitions += 1
    else:
        repetitions = 0
        interval = 1

    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    if ease < 1.3:
        ease = 1.3

    now = _utcnow()
    due_date = now + timedelta(days=interval)

    return {
        "sm2_ease": round(ease, 4),
        "sm2_interval": int(interval),
        "sm2_repetitions": int(repetitions),
        "due_date": due_date,
        "last_reviewed_at": now,
    }
