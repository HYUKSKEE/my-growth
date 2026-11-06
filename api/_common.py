"""Vercel Python 함수 공용 코드. `_` 로 시작하는 파일은 라우트가 되지 않는다.

보안 원칙
- 사용자의 Supabase access token 으로만 DB 를 호출한다 (service role 키 사용 안 함).
  → auth.uid() 기준 RPC 가 본인 행만 쓰므로, 이 함수가 뚫려도 타인 데이터에는 접근 못 함.
- 가민 비밀번호는 메모리에서만 쓰고 저장/로그하지 않는다.
"""

from __future__ import annotations

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler
from typing import Any

from supabase import Client, create_client


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def user_client(headers: Any) -> Client:
    auth = headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise ApiError(401, "로그인이 필요합니다.")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        raise ApiError(500, "서버 환경변수가 설정되지 않았습니다.")
    sb = create_client(url, key)
    sb.postgrest.auth(auth[7:].strip())
    return sb


class JsonHandler(BaseHTTPRequestHandler):
    """POST JSON → process(body, headers) → JSON. 예외는 안전한 메시지로 변환."""

    def process(self, body: dict, headers: Any) -> dict:  # pragma: no cover
        raise NotImplementedError

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 10_000:
                raise ApiError(413, "요청이 너무 큽니다.")
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ApiError(400, "잘못된 요청입니다.")
            self._send(200, self.process(body, self.headers))
        except ApiError as e:
            self._send(e.status, {"error": e.message})
        except Exception:
            # 내부 예외 메시지에 자격증명/세션 정보가 섞일 수 있으니 상세는 노출하지 않는다.
            self._send(500, {"error": "처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요."})

    def _send(self, status: int, payload: dict) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args: Any) -> None:  # 요청 로그에 본문이 남지 않도록 비활성화
        pass


def start_first_sync(sb: Client) -> bool:
    """가민 연결 직후 첫 동기화를 GitHub Actions 로 즉시 실행한다.

    - 호출 허용 여부는 DB 함수(request_first_sync)가 판단: 첫 동기화 전 + 10분에 1회만 true.
    - 실패해도 연결 자체는 성공이므로 예외를 밖으로 내지 않는다 (매시 정각 예약 실행이 대신 처리).
    - GITHUB_DISPATCH_TOKEN 은 이 저장소 하나의 Actions 실행 권한만 가진 토큰이어야 한다.
    """
    token = os.environ.get("GITHUB_DISPATCH_TOKEN")
    if not token:
        return False
    try:
        if not sb.rpc("request_first_sync").execute().data:
            return False
        repo = os.environ.get("GITHUB_REPO", "HYUKSKEE/my-growth")
        api = os.environ.get("GITHUB_API_URL", "https://api.github.com")
        req = urllib.request.Request(
            f"{api}/repos/{repo}/actions/workflows/garmin-sync.yml/dispatches",
            data=json.dumps({"ref": os.environ.get("GITHUB_REF_NAME", "main"), "inputs": {"new_only": "true"}}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "garmin-growth",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status == 204
    except Exception:
        return False
