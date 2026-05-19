"""
LLM client abstraction for CIRO.
Supports: Gemini (google-generativeai), OpenAI, Ollama.
Provider selected via LLM_PROVIDER env var.
"""

from __future__ import annotations
import json
import logging
import requests

from .config import (
    LLM_PROVIDER,
    OLLAMA_MODEL, OLLAMA_URL,
    OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_ORG_ID, OPENAI_PROJECT_ID,
    GEMINI_API_KEY, GEMINI_MODEL,
)

logger = logging.getLogger(__name__)


def get_llm_provider() -> str:
    return (LLM_PROVIDER or "ollama").strip().lower()


def get_llm_model() -> str:
    p = get_llm_provider()
    if p == "openai":
        return OPENAI_MODEL
    if p == "gemini":
        return GEMINI_MODEL
    return OLLAMA_MODEL


def generate_json_completion(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.0,
    max_output_tokens: int = 512,
    timeout: int = 90,
) -> str:
    provider = get_llm_provider()
    if provider == "gemini":
        return _gemini(system_prompt, user_prompt, temperature, max_output_tokens, timeout)
    if provider == "openai":
        return _openai(system_prompt, user_prompt, temperature, max_output_tokens, timeout)
    return _ollama(system_prompt, user_prompt, temperature, max_output_tokens, timeout)


# ── Gemini ────────────────────────────────────────────────────────────────────

def _gemini(system_prompt: str, user_prompt: str, temperature: float, max_tokens: int, timeout: int) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
        ),
    )
    return response.text


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _openai(system_prompt: str, user_prompt: str, temperature: float, max_tokens: int, timeout: int) -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set")

    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    if OPENAI_ORG_ID:
        headers["OpenAI-Organization"] = OPENAI_ORG_ID
    if OPENAI_PROJECT_ID:
        headers["OpenAI-Project"] = OPENAI_PROJECT_ID

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    r = requests.post(f"{OPENAI_BASE_URL.rstrip('/')}/chat/completions", headers=headers, json=payload, timeout=timeout)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


# ── Ollama ────────────────────────────────────────────────────────────────────

def _ollama(system_prompt: str, user_prompt: str, temperature: float, max_tokens: int, timeout: int) -> str:
    r = requests.post(
        f"{OLLAMA_URL}/api/generate",
        headers={"Content-Type": "application/json"},
        json={
            "model": OLLAMA_MODEL,
            "prompt": f"{system_prompt}\n\n{user_prompt}",
            "format": "json",
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json().get("response", "")