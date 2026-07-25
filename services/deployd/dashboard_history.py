"""
Time-series history for the dashboard gauges.

Each metric is stored as a JSONL file under HISTORY_DIR
(/var/lib/late-dashboard/metrics by default). One line per
sample, append-only. The file is rolled on read: samples
older than the retention horizon are dropped, so the
file never grows unbounded.

Sampling is driven by the dashboard's gather path: every
time /dashboard renders, we append one sample per
metric. That gives ~1 sample / 30 s in normal use
(close to the auto-refresh interval). At 30 s spacing
the 30-day horizon is ~86 K lines per metric, which is
fine for JSONL.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Iterable

# ponytail: pinned to /var/lib because the deployd runs as
# root and /var is the conventional place for service data.
# Override with LATE_DASHBOARD_HISTORY_DIR for tests.
HISTORY_DIR = Path(
    os.environ.get("LATE_DASHBOARD_HISTORY_DIR", "/var/lib/late-dashboard/metrics")
)

# How long a single JSONL file can grow before we roll it.
# 30 days is the longest range we expose. We keep a tiny
# margin so a sample at the edge of the window still has
# neighbors to draw a line through.
RETENTION_SECONDS = 31 * 24 * 3600

# Granularity used when downsampling very dense windows.
# The frontend wants up to 1000 points per chart. Beyond
# that we average adjacent samples to keep the SVG sane.
DOWNSAMPLE_TARGET = 1000


# Range presets in seconds. The frontend asks for one of
# these strings; the rest is a label.
RANGES: dict[str, int] = {
    "1h": 3600,
    "6h": 6 * 3600,
    "24h": 24 * 3600,
    "7d": 7 * 24 * 3600,
    "30d": 30 * 24 * 3600,
}


def _path(metric: str) -> Path:
    safe = "".join(c for c in metric if c.isalnum() or c in "_-")
    if not safe:
        raise ValueError("invalid metric name")
    return HISTORY_DIR / f"{safe}.jsonl"


def _ensure_dir() -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def append_sample(metric: str, value: float, t: float | None = None) -> None:
    """Append a single (t, v) sample to a metric's JSONL file."""
    try:
        _ensure_dir()
    except OSError:
        return  # disk full, no parent — fail soft, the dashboard keeps working
    if t is None:
        t = time.time()
    p = _path(metric)
    try:
        # We do an atomic-ish append: open, write, close.
        # Concurrent appends from a single deployd are
        # serialized by the GIL; multi-process is not a
        # concern (uvicorn runs one worker).
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"t": t, "v": value}) + "\n")
    except OSError:
        return


def read_samples(metric: str, range_seconds: int) -> list[dict]:
    """Return samples in the given range, oldest first.

    The file is filtered to (now - range, now] and may be
    downsampled to DOWNSAMPLE_TARGET points. Tries not to
    break when the file is missing or corrupt.
    """
    p = _path(metric)
    if not p.exists():
        return []
    now = time.time()
    cutoff = now - range_seconds
    raw: list[dict] = []
    try:
        with p.open("r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    t = float(row.get("t", 0))
                    v = float(row.get("v"))
                except (ValueError, TypeError):
                    continue
                if t < cutoff or t > now:
                    continue
                raw.append({"t": t, "v": v})
    except OSError:
        return []
    raw.sort(key=lambda r: r["t"])
    if len(raw) <= DOWNSAMPLE_TARGET:
        return raw
    # LTTB-lite: bucket consecutive samples and average
    # them. Buckets of N = ceil(n / target).
    n = len(raw)
    bucket = (n + DOWNSAMPLE_TARGET - 1) // DOWNSAMPLE_TARGET
    out: list[dict] = []
    for i in range(0, n, bucket):
        chunk = raw[i : i + bucket]
        if not chunk:
            continue
        t = chunk[len(chunk) // 2]["t"]
        v = sum(c["v"] for c in chunk) / len(chunk)
        out.append({"t": t, "v": v})
    return out


def roll() -> None:
    """Drop samples older than the retention horizon.

    Run on every read; cheap because the file is small
    after the first roll and the cutoff is well-defined.
    """
    if not HISTORY_DIR.exists():
        return
    cutoff = time.time() - RETENTION_SECONDS
    for p in HISTORY_DIR.glob("*.jsonl"):
        try:
            with p.open("r", encoding="utf-8") as f:
                lines = f.readlines()
        except OSError:
            continue
        kept: list[str] = []
        for line in lines:
            try:
                t = float(json.loads(line).get("t", 0))
            except (ValueError, TypeError):
                continue
            if t >= cutoff:
                kept.append(line)
        if len(kept) < len(lines):
            try:
                with p.open("w", encoding="utf-8") as f:
                    f.writelines(kept)
            except OSError:
                pass
