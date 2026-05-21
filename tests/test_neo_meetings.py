"""Tests for Neo Meetings backend."""
import json
import time
from pathlib import Path

import pytest

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))


@pytest.fixture(autouse=True)
def isolate_meetings(tmp_path, monkeypatch):
    """Point MEETINGS_FILE to a temp file so tests don't touch real data."""
    fake = tmp_path / "meetings.json"
    monkeypatch.setattr("api.config.MEETINGS_FILE", fake)
    import api.meetings as m
    monkeypatch.setattr(m, "MEETINGS_FILE", fake)
    yield fake


class TestMeetingsStore:
    def test_load_empty(self):
        from api.meetings import load_meetings
        result = load_meetings()
        assert result == []

    def test_create_meeting(self):
        from api.meetings import create_meeting, load_meetings
        meeting = create_meeting(
            title="Sprint Review",
            project="obreiro",
            objective="alinhamento",
            participants=["junior", "cliente"],
        )
        assert meeting["id"]
        assert meeting["title"] == "Sprint Review"
        assert meeting["status"] == "planned"
        assert meeting["room_url"].startswith("https://")
        stored = load_meetings()
        assert len(stored) == 1
        assert stored[0]["id"] == meeting["id"]

    def test_finish_meeting(self):
        from api.meetings import create_meeting, finish_meeting, load_meetings
        m = create_meeting(title="Test", project="test", objective="briefing")
        result = finish_meeting(m["id"])
        assert result["status"] == "finished"
        stored = load_meetings()
        assert stored[0]["status"] == "finished"

    def test_start_meeting(self):
        from api.meetings import create_meeting, load_meetings, start_meeting
        m = create_meeting(title="Daily", project="neo", objective="alinhamento")
        result = start_meeting(m["id"])
        assert result["status"] == "active"
        assert result["started_at"] is not None
        stored = load_meetings()
        assert stored[0]["status"] == "active"

    def test_update_summary(self):
        from api.meetings import create_meeting, load_meetings, update_summary
        m = create_meeting(title="Review", project="neo", objective="homologacao")
        summary = {"decisions": ["ship"], "next_steps": ["homologar"]}
        result = update_summary(m["id"], summary)
        assert result["status"] == "processed"
        assert result["summary"] == summary
        stored = load_meetings()
        assert stored[0]["summary"] == summary

    def test_finish_nonexistent(self):
        from api.meetings import finish_meeting
        result = finish_meeting("nonexistent-id")
        assert result is None


class TestMeetingsPanelRegistration:
    """Verify the meetings panel is properly wired in the frontend."""

    def test_panels_js_has_meetings(self):
        panels_js = (Path(__file__).parent.parent / "static" / "panels.js").read_text()
        assert "meetings: 'tab_meetings'" in panels_js
        assert "'meetings'" in panels_js
        assert "showing-meetings" in panels_js

    def test_index_html_has_meetings_elements(self):
        index_html = (Path(__file__).parent.parent / "static" / "index.html").read_text()
        assert 'data-panel="meetings"' in index_html
        assert 'id="mainMeetings"' in index_html
        assert 'data-dashboard-action="new_meeting"' in index_html

    def test_i18n_has_meetings_keys(self):
        i18n_js = (Path(__file__).parent.parent / "static" / "i18n.js").read_text()
        assert "tab_meetings" in i18n_js
        assert "meetings_title" in i18n_js
        assert "action_new_meeting" in i18n_js
        assert "meetings_details" in i18n_js
        assert "meetings_detail_title" in i18n_js
        assert "meetings_post_desc" in i18n_js

    def test_dashboard_handles_new_meeting(self):
        dashboard_js = (Path(__file__).parent.parent / "static" / "dashboard.js").read_text()
        assert "new_meeting" in dashboard_js

    def test_style_has_meetings_classes(self):
        style_css = (Path(__file__).parent.parent / "static" / "style.css").read_text()
        assert ".meetings-form" in style_css
        assert ".meetings-detail" in style_css
        assert ".meetings-state-panel" in style_css
        assert ".meetings-external-room" in style_css
        assert "showing-meetings" in style_css

    def test_summary_prompt_uses_participant_names_not_objects(self):
        meetings_js = (Path(__file__).parent.parent / "static" / "meetings.js").read_text()
        assert ".map(p => typeof p === 'string' ? p : p?.name)" in meetings_js
        assert "_activeMeeting.participants.join" not in meetings_js

    def test_meeting_room_opens_outside_webui_not_iframe(self):
        meetings_js = (Path(__file__).parent.parent / "static" / "meetings.js").read_text()
        assert "openMeetingWindowPlaceholder" in meetings_js
        assert "openMeetingRoom" in meetings_js
        assert "id=\"meetingsJitsiFrame\"" not in meetings_js
        assert "sandbox=" not in meetings_js

    def test_meeting_cards_open_detail_for_every_status(self):
        meetings_js = (Path(__file__).parent.parent / "static" / "meetings.js").read_text()
        assert "function renderMeetingDetail" in meetings_js
        assert "function openMeetingDetails" in meetings_js
        assert "onclick=\"openMeetingDetails('${meeting.id}')\"" in meetings_js
        assert "renderPostMeeting" not in meetings_js
