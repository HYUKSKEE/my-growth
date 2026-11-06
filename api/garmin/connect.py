"""POST /api/garmin/connect  {email, password}
→ {status: "ok"} 또는 {status: "mfa"} (MFA 코드 필요 → /api/garmin/mfa)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # api/ → _common 임포트

from garminconnect import Garmin
from garminconnect.exceptions import GarminConnectAuthenticationError

from _common import ApiError, JsonHandler, start_first_sync, user_client


class handler(JsonHandler):
    def process(self, body, headers):
        sb = user_client(headers)
        email = str(body.get("email", "")).strip()
        password = str(body.get("password", ""))
        if not email or not password:
            raise ApiError(400, "가민 이메일과 비밀번호를 입력하세요.")

        g = Garmin(email, password, return_on_mfa=True)
        try:
            status, state = g.login()
        except GarminConnectAuthenticationError:
            raise ApiError(401, "가민 이메일 또는 비밀번호가 올바르지 않습니다.")

        if status == "needs_mfa":
            sb.rpc("save_mfa_state", {"p_state": state}).execute()
            return {"status": "mfa"}

        sb.rpc("set_garmin_tokens", {"p_tokens": g.client.dumps()}).execute()
        return {"status": "ok", "syncing": start_first_sync(sb)}
