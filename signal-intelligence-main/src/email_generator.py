"""
Daily Intelligence Email Generator.
Produces a premium, executive-ready HTML email with 6 sections:
1. Top Movers (with score change deltas)
2. High Impact Signals
3. Executive Moves (C-suite / director job changes)
4. Watchlist (activity spikes)
5. Quiet Companies
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from .config import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, FROM_EMAIL, TO_EMAIL

logger = logging.getLogger(__name__)


def _section_header(title: str, emoji: str, color: str) -> str:
    return f"""
    <tr>
      <td style="padding: 28px 32px 12px;">
        <h2 style="margin:0; font-size:20px; font-weight:700; color:{color};">
          {emoji}&nbsp; {title}
        </h2>
        <hr style="border:none; border-top:2px solid {color}; margin-top:8px;">
      </td>
    </tr>"""


def _signal_card(company: str, description: str, score: str = "",
                 impact: str = "", confidence: str = "", source: str = "") -> str:
    impact_colors = {"high": "#e74c3c", "medium": "#f39c12", "low": "#27ae60"}
    badge_color = impact_colors.get(impact, "#95a5a6")

    score_badge = ""
    if score:
        score_badge = f"""<span style="display:inline-block; background:#2c3e50; color:#ecf0f1;
            padding:2px 10px; border-radius:12px; font-size:13px; font-weight:600;
            margin-right:8px;">Score: {score}</span>"""

    impact_badge = ""
    if impact:
        impact_badge = f"""<span style="display:inline-block; background:{badge_color}; color:#fff;
            padding:2px 10px; border-radius:12px; font-size:12px; text-transform:uppercase;
            font-weight:600;">{impact}</span>"""

    source_link = ""
    if source:
        source_link = f"""<a href="{source}" style="color:#3498db; font-size:12px;
            text-decoration:none;">View Source →</a>"""

    return f"""
    <tr>
      <td style="padding: 6px 32px;">
        <div style="background:#f8f9fa; border-radius:10px; padding:16px 20px; margin-bottom:4px;
                    border-left:4px solid {badge_color};">
          <div style="margin-bottom:6px;">
            <strong style="font-size:15px; color:#2c3e50;">{company}</strong>
            &nbsp;{score_badge}{impact_badge}
          </div>
          <p style="margin:4px 0 6px; font-size:14px; color:#555; line-height:1.5;">
            {description}
          </p>
          {source_link}
        </div>
      </td>
    </tr>"""


def _company_row(name: str, score: float, extra: str = "") -> str:
    bar_width = min(100, max(5, score))
    return f"""
    <tr>
      <td style="padding:4px 32px;">
        <div style="display:flex; align-items:center; gap:12px; padding:8px 0;">
          <strong style="min-width:140px; font-size:14px; color:#2c3e50;">{name}</strong>
          <div style="flex:1; background:#ecf0f1; border-radius:6px; height:20px; overflow:hidden;">
            <div style="width:{bar_width}%; background:linear-gradient(90deg,#3498db,#2ecc71);
                        height:100%; border-radius:6px;"></div>
          </div>
          <span style="min-width:50px; text-align:right; font-size:14px; font-weight:600;
                       color:#2c3e50;">{score}</span>
          <span style="font-size:12px; color:#999;">{extra}</span>
        </div>
      </td>
    </tr>"""


def _mover_row(name: str, score: float, score_change: float = 0,
              change_pct: float = 0, prev_score: float = 0,
              signal_count: int = 0) -> str:
    """Render a top-mover row with score change delta."""
    bar_width = min(100, max(5, score))
    is_positive = score_change >= 0
    arrow = "▲" if is_positive else "▼"
    delta_color = "#27ae60" if is_positive else "#e74c3c"
    sign = "+" if is_positive else ""

    return f"""
    <tr>
      <td style="padding:4px 32px;">
        <div style="background:#f8f9fa; border-radius:10px; padding:14px 18px; margin-bottom:4px;
                    border-left:4px solid {delta_color};">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <strong style="font-size:15px; color:#2c3e50;">{name}</strong>
            <span style="font-size:22px; font-weight:700; color:#2c3e50;">{score:.1f}</span>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <span style="color:{delta_color}; font-size:15px; font-weight:700;">
                {arrow} {sign}{score_change:.1f}
              </span>
              <span style="color:{delta_color}; font-size:12px; margin-left:4px;">
                ({sign}{change_pct:.1f}%)
              </span>
              <span style="color:#999; font-size:12px; margin-left:8px;">
                {prev_score:.1f} → {score:.1f}
              </span>
            </div>
            <span style="font-size:12px; color:#999;">{signal_count} signals</span>
          </div>
          <div style="background:#ecf0f1; border-radius:6px; height:6px; overflow:hidden; margin-top:8px;">
            <div style="width:{bar_width}%; background:linear-gradient(90deg,#3498db,#2ecc71);
                        height:100%; border-radius:6px;"></div>
          </div>
        </div>
      </td>
    </tr>"""


def _exec_card(person_name: str, title: str, company: str,
              change_type: str, source_url: str = "",
              change_date: str = "", snippet: str = "") -> str:
    """Render an executive change card."""
    type_config = {
        "joined": {"emoji": "🟢", "label": "Joined", "color": "#27ae60"},
        "left":   {"emoji": "🔴", "label": "Left",   "color": "#e74c3c"},
        "promoted": {"emoji": "🟡", "label": "Promoted", "color": "#f39c12"},
    }
    cfg = type_config.get(change_type, type_config["joined"])

    date_str = f"<span style='font-size:12px; color:#999; margin-left:8px;'>{change_date}</span>" if change_date else ""
    source_link = ""
    if source_url:
        source_link = f"""<a href="{source_url}" style="color:#3498db; font-size:12px;
            text-decoration:none;">View on LinkedIn →</a>"""

    snippet_html = ""
    if snippet:
        snippet_html = f"""<p style="margin:4px 0 6px; font-size:13px; color:#777; line-height:1.4;
            overflow:hidden; max-height:40px;">{snippet[:200]}</p>"""

    return f"""
    <tr>
      <td style="padding:4px 32px;">
        <div style="background:#f8f9fa; border-radius:10px; padding:14px 18px; margin-bottom:4px;
                    border-left:4px solid {cfg['color']};">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
            <div>
              <strong style="font-size:15px; color:#2c3e50;">{person_name}</strong>
              <span style="display:inline-block; font-size:13px; color:#555; margin-left:6px;">{title}</span>
            </div>
            <span style="display:inline-block; background:{cfg['color']}; color:#fff;
                padding:2px 10px; border-radius:12px; font-size:12px; font-weight:600;">
              {cfg['emoji']} {cfg['label']}
            </span>
          </div>
          <div style="font-size:13px; color:#555; margin-bottom:4px;">
            🏢 {company} {date_str}
          </div>
          {snippet_html}
          {source_link}
        </div>
      </td>
    </tr>"""


def generate_email_html(
    top_movers: list[dict],
    high_impact_signals: list[dict],
    watchlist: list[dict],
    quiet_companies: list[dict],
    executive_changes: list[dict] = None,
    date: str = None,
) -> str:
    """Generate the full premium HTML email body."""

    date = date or datetime.now().strftime("%B %d, %Y")

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#e9ecef; font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e9ecef; padding:20px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0"
       style="background:#ffffff; border-radius:12px; box-shadow:0 2px 12px rgba(0,0,0,0.08);
              overflow:hidden;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460); padding:32px;
               text-align:center;">
      <h1 style="margin:0; color:#ecf0f1; font-size:24px; font-weight:300; letter-spacing:1px;">
        📡 Signal Intelligence Report
      </h1>
      <p style="margin:8px 0 0; color:#bdc3c7; font-size:14px;">{date}</p>
    </td>
  </tr>
"""

    # Section 1: Top Movers (with score change deltas)
    html += _section_header("Top Movers – Biggest Score Changes", "🚀", "#0f3460")
    if top_movers:
        for entry in top_movers[:10]:
            html += _mover_row(
                name=entry.get("company_name", entry.get("name", "")),
                score=entry.get("total_score", entry.get("score", 0)),
                score_change=entry.get("score_change", 0),
                change_pct=entry.get("change_pct", 0),
                prev_score=entry.get("prev_score", 0) or 0,
                signal_count=entry.get("signal_count", 0),
            )
    else:
        html += """<tr><td style="padding:8px 32px; color:#999; font-size:14px;">
            No activity scored today.</td></tr>"""

    # Section 2: High Impact Signals
    html += _section_header("High Impact Signals", "⚡", "#e74c3c")
    if high_impact_signals:
        for sig in high_impact_signals[:10]:
            html += _signal_card(
                company=sig.get("company_name", ""),
                description=sig.get("description", ""),
                score=str(round(sig.get("score", 0), 1)),
                impact=sig.get("impact", "high"),
                source=sig.get("source_url", ""),
            )
    else:
        html += """<tr><td style="padding:8px 32px; color:#999; font-size:14px;">
            No high-impact signals detected today.</td></tr>"""

    # Section 3: Watchlist
    html += _section_header("Watchlist – Activity Spikes", "👀", "#f39c12")
    if watchlist:
        for entry in watchlist[:5]:
            spike = entry.get("spike_ratio", "")
            extra = f"↑ {spike}× vs avg" if spike else ""
            html += _company_row(
                entry.get("company_name", ""),
                entry.get("today_score", 0),
                extra,
            )
    else:
        html += """<tr><td style="padding:8px 32px; color:#999; font-size:14px;">
            No unusual activity spikes today.</td></tr>"""

    # Section 4: Executive Moves
    exec_list = executive_changes or []
    html += _section_header("Executive Moves – C-Suite & Directors", "👔", "#8e44ad")
    if exec_list:
        for ec in exec_list[:15]:
            html += _exec_card(
                person_name=ec.get("person_name", ""),
                title=ec.get("title", ""),
                company=ec.get("company_name", ""),
                change_type=ec.get("change_type", "joined"),
                source_url=ec.get("source_url", ""),
                change_date=ec.get("change_date", ""),
                snippet=ec.get("previous_info", ""),
            )
    else:
        html += """<tr><td style="padding:8px 32px; color:#999; font-size:14px;">
            No executive moves detected today.</td></tr>"""

    # Section 4: Quiet Companies
    html += _section_header("Quiet Companies", "🔇", "#95a5a6")
    if quiet_companies:
        names = ", ".join(c.get("company_name", "") for c in quiet_companies[:10])
        html += f"""<tr><td style="padding:8px 32px; font-size:14px; color:#777;">
            {names}</td></tr>"""
    else:
        html += """<tr><td style="padding:8px 32px; color:#999; font-size:14px;">
            All companies showed activity today.</td></tr>"""

    # Footer
    html += """
  <tr>
    <td style="padding:24px 32px; text-align:center; border-top:1px solid #ecf0f1;">
      <p style="margin:0; font-size:12px; color:#bdc3c7;">
        Signal Intelligence Engine &bull; Automated Strategic Signal Detection
      </p>
    </td>
  </tr>
</table>
</td></tr></table>
</body></html>"""

    return html


def send_email(html_content: str, subject: str = None):
    """Send the intelligence email via SMTP."""
    subject = subject or f"Signal Intelligence Report – {datetime.now().strftime('%B %d, %Y')}"

    msg = MIMEMultipart("alternative")
    msg["From"] = FROM_EMAIL
    msg["To"] = TO_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(html_content, "html"))

    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP not configured — printing email to stdout.")
        print("\n" + "=" * 60)
        print(f"SUBJECT: {subject}")
        print("=" * 60)
        # Show a text-only preview
        from html import unescape
        import re
        text = re.sub(r"<[^>]+>", " ", html_content)
        text = unescape(text)
        text = re.sub(r"\s+", " ", text).strip()
        print(text[:2000])
        print("=" * 60 + "\n")
        return

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        logger.info(f"Intelligence email sent to {TO_EMAIL}")
    except Exception as e:
        logger.error(f"Email delivery failed: {e}")
        # Fallback: save to file
        path = f"report_{datetime.now().strftime('%Y%m%d')}.html"
        with open(path, "w") as f:
            f.write(html_content)
        logger.info(f"Email saved to {path} as fallback")
