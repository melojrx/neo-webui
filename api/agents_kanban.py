"""Neo WebUI — Agents Kanban (Hermes runtime).

Exposes the runtime Kanban (`hermes_cli.kanban_db`) as REST endpoints under
`/api/agents-kanban/*`, distinct from the Neo `Projects` panel which is the
custom user-facing project/task tracker with Jira sync.  The Agents Kanban is
the Hermes-agent multi-agent task board (triaged/queued/running by the
dispatcher), shown next to the Projects tab in the WebUI.

Design notes
------------
* The runtime exposes its own board/db model (boards, tasks with `triage`,
  `todo`, `scheduled`, `ready`, `running`, `blocked`, `review`, `done`,
  `archived` statuses).  We mirror that verbatim so the UI can render columns
  1:1.
* All write operations call into `kanban_db` directly (no aiohttp relay).
  The webui shares process state with the gateway on this VPS, so the
  dispatcher's in-flight updates appear immediately on the next GET.
* Read endpoints use `kanban_db.connect_closing` to avoid holding the SQLite
  connection across HTTP request boundaries.
* Mutations are limited to what `kanban_db` exposes publicly: `create_task`,
  `delete_task`, `add_comment`, plus a focused `set_status` raw SQL helper
  for board moves (the dispatcher doesn't expose a generic update).
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

# Lazy import — kanban_db is heavy (pydantic-style models) and the webui
# imports `api.routes` early.  We only pull it on first request.
_kanban_db = None
_import_lock = threading.Lock()


def _db():
    global _kanban_db
    if _kanban_db is not None:
        return _kanban_db
    with _import_lock:
        if _kanban_db is None:
            from hermes_cli import kanban_db as kd

            _kanban_db = kd
    return _kanban_db


def _task_to_dict(t) -> dict[str, Any]:
    """Convert a `kanban_db.Task` row to a JSON-safe dict for the frontend."""
    return {
        "id": t.id,
        "title": t.title,
        "body": t.body or "",
        "assignee": t.assignee or "",
        "status": t.status,
        "priority": t.priority,
        "created_by": t.created_by or "",
        "created_at": t.created_at,
        "started_at": t.started_at,
        "completed_at": t.completed_at,
        "workspace_kind": t.workspace_kind,
        "workspace_path": t.workspace_path or "",
        "branch_name": t.branch_name or "",
        "result": t.result or "",
        "worker_pid": t.worker_pid,
        "current_run_id": t.current_run_id,
        "consecutive_failures": t.consecutive_failures,
        "skills": t.skills or [],
        "max_runtime_seconds": t.max_runtime_seconds,
    }


def _find_task_board(task_id: str) -> tuple[str, Any] | None:
    """Scan all known boards for a task.  Returns (board_slug, task) or None."""
    kd = _db()
    for board in (b.get("slug") for b in (list_boards().get("boards") or [])):
        try:
            with kd.connect_closing(board=board) as conn:
                t = kd.get_task(conn, task_id)
                if t is not None:
                    return board, t
        except Exception as exc:
            logger.debug("agents_kanban: _find_task_board on %s failed: %s", board, exc)
    return None


def list_boards() -> dict[str, Any]:
    kd = _db()
    boards: list[dict[str, Any]] = []
    try:
        for entry in kd.list_boards(include_archived=True):
            slug = entry.get("slug") or entry.get("name") or kd.DEFAULT_BOARD
            try:
                meta = kd.read_board_metadata(slug) or {}
            except Exception:
                meta = {}
            counts: dict[str, int] = {s: 0 for s in sorted(kd.VALID_STATUSES)}
            try:
                with kd.connect_closing(board=slug) as conn:
                    rows = conn.execute(
                        "SELECT status, COUNT(*) FROM tasks GROUP BY status"
                    ).fetchall()
                for status, n in rows:
                    if status in counts:
                        counts[status] = int(n)
            except Exception as exc:
                logger.debug("agents_kanban: count query for %s failed: %s", slug, exc)
            boards.append(
                {
                    "slug": slug,
                    "name": meta.get("display_name") or slug,
                    "display_name": entry.get("display_name", slug),
                    "description": entry.get("description", ""),
                    "is_default": slug == kd.DEFAULT_BOARD,
                    "archived": bool(meta.get("archived_at")),
                    "created_at": meta.get("created_at"),
                    "counts": counts,
                }
            )
    except Exception as exc:
        logger.warning("agents_kanban: list_boards failed: %s", exc)
    return {
        "boards": boards,
        "default_board": kd.DEFAULT_BOARD,
        "valid_statuses": sorted(kd.VALID_STATUSES),
        "now": time.time(),
    }


def list_tasks(board: str, status: str | None = None, limit: int = 200) -> dict[str, Any]:
    kd = _db()
    if status and status not in kd.VALID_STATUSES:
        return {"error": f"invalid status: {status}", "tasks": []}
    out: list[dict[str, Any]] = []
    try:
        with kd.connect_closing(board=board) as conn:
            for task in kd.list_tasks(conn, status=status, limit=limit):
                out.append(_task_to_dict(task))
    except Exception as exc:
        logger.warning("agents_kanban: list_tasks failed for %s: %s", board, exc)
        return {"error": str(exc), "tasks": []}
    return {
        "board": board,
        "status": status,
        "tasks": out,
        "count": len(out),
    }


def get_task(task_id: str) -> dict[str, Any]:
    found = _find_task_board(task_id)
    if found is None:
        return {"error": f"task {task_id} not found"}
    board, t = found
    d = _task_to_dict(t)
    d["board"] = board
    return d


def list_stats(board: str | None = None) -> dict[str, Any]:
    payload = list_boards()
    boards = payload.get("boards") or []
    if board:
        targets = [b for b in boards if b["slug"] == board] or [{"slug": board, "counts": {}}]
    else:
        targets = boards
    total = 0
    by_status: dict[str, int] = {}
    active_workers = 0
    for b in targets:
        for status, n in b.get("counts", {}).items():
            total += int(n)
            by_status[status] = by_status.get(status, 0) + int(n)
        # Active workers = tasks currently in `running` with a worker_pid set.
        kd = _db()
        try:
            with kd.connect_closing(board=b["slug"]) as conn:
                row = conn.execute(
                    "SELECT COUNT(*) FROM tasks WHERE status = 'running' "
                    "AND worker_pid IS NOT NULL"
                ).fetchone()
                active_workers += int(row[0] or 0)
        except Exception:
            pass
    return {
        "board": board,
        "total": total,
        "by_status": by_status,
        "active_workers": active_workers,
        "boards": [b["slug"] for b in targets],
    }


def create_task(body: dict[str, Any]) -> dict[str, Any]:
    kd = _db()
    title = (body.get("title") or "").strip()
    if not title:
        return {"error": "title is required"}
    board = body.get("board") or kd.DEFAULT_BOARD
    try:
        with kd.connect_closing(board=board) as conn:
            task = kd.create_task(
                conn,
                title=title,
                body=body.get("body") or "",
                assignee=body.get("assignee") or None,
                priority=int(body.get("priority") or 0),
                created_by=body.get("created_by") or "neo-webui",
                workspace_kind=body.get("workspace_kind") or "local",
                workspace_path=body.get("workspace_path") or None,
                skills=body.get("skills") or None,
            )
        return _task_to_dict(task)
    except Exception as exc:
        logger.warning("agents_kanban: create_task failed: %s", exc)
        return {"error": str(exc)}


def set_task_status(task_id: str, new_status: str) -> dict[str, Any]:
    """Move a task between columns.  Only transitions allowed by the runtime's
    state machine are honored: triage/todo/scheduled/ready/running/blocked/
    review/done/archived.  The dispatcher itself owns `running` — we set it
    locally for visualization only when no worker is attached, otherwise the
    next dispatcher tick will overwrite it.
    """
    kd = _db()
    if new_status not in kd.VALID_STATUSES:
        return {"error": f"invalid status: {new_status}"}
    found = _find_task_board(task_id)
    if found is None:
        return {"error": f"task {task_id} not found"}
    board, _t = found
    try:
        with kd.connect_closing(board=board) as conn:
            # Don't clobber a running task with a worker — let the dispatcher do that.
            row = conn.execute(
                "SELECT status, worker_pid FROM tasks WHERE id = ?", (task_id,)
            ).fetchone()
            if row is None:
                return {"error": f"task {task_id} disappeared"}
            current_status, worker_pid = row[0], row[1]
            if current_status == "running" and worker_pid:
                return {
                    "error": "task is being executed by a worker — let the dispatcher manage its status"
                }
            conn.execute(
                "UPDATE tasks SET status = ? WHERE id = ?", (new_status, task_id)
            )
            conn.commit()
            t = kd.get_task(conn, task_id)
        d = _task_to_dict(t) if t else {"id": task_id, "status": new_status}
        d["board"] = board
        return d
    except Exception as exc:
        logger.warning("agents_kanban: set_task_status failed: %s", exc)
        return {"error": str(exc)}


def delete_task(task_id: str) -> dict[str, Any]:
    kd = _db()
    found = _find_task_board(task_id)
    if found is None:
        return {"error": f"task {task_id} not found"}
    board, _t = found
    try:
        with kd.connect_closing(board=board) as conn:
            kd.delete_task(conn, task_id)
        return {"ok": True, "id": task_id, "board": board}
    except Exception as exc:
        logger.warning("agents_kanban: delete_task failed: %s", exc)
        return {"error": str(exc)}


def list_comments(task_id: str) -> dict[str, Any]:
    kd = _db()
    found = _find_task_board(task_id)
    if found is None:
        return {"error": f"task {task_id} not found", "comments": []}
    board, _t = found
    try:
        with kd.connect_closing(board=board) as conn:
            comments = kd.list_comments(conn, task_id)
        return {
            "task_id": task_id,
            "board": board,
            "comments": [
                {
                    "id": c.id,
                    "author": c.author or "",
                    "body": c.body or "",
                    "created_at": c.created_at,
                }
                for c in comments
            ],
        }
    except Exception as exc:
        logger.debug("agents_kanban: list_comments on %s failed: %s", board, exc)
        return {"error": str(exc), "comments": []}


def add_comment(task_id: str, body: dict[str, Any]) -> dict[str, Any]:
    kd = _db()
    text = (body.get("body") or "").strip()
    if not text:
        return {"error": "body is required"}
    author = body.get("author") or "neo-webui"
    found = _find_task_board(task_id)
    if found is None:
        return {"error": f"task {task_id} not found"}
    board, _t = found
    try:
        with kd.connect_closing(board=board) as conn:
            kd.add_comment(conn, task_id, author, text)
        return {"ok": True, "task_id": task_id, "board": board}
    except Exception as exc:
        logger.warning("agents_kanban: add_comment failed: %s", exc)
        return {"error": str(exc)}


def list_events(task_id: str, limit: int = 100) -> dict[str, Any]:
    kd = _db()
    found = _find_task_board(task_id)
    if found is None:
        return {"error": f"task {task_id} not found", "events": []}
    board, _t = found
    try:
        with kd.connect_closing(board=board) as conn:
            events = kd.list_events(conn, task_id)
        return {
            "task_id": task_id,
            "board": board,
            "events": [
                {
                    "id": e.id,
                    "kind": e.kind or "",
                    "payload": e.payload if isinstance(e.payload, dict) else {},
                    "created_at": e.created_at,
                }
                for e in events[:limit]
            ],
        }
    except Exception as exc:
        logger.debug("agents_kanban: list_events on %s failed: %s", board, exc)
        return {"error": str(exc), "events": []}
