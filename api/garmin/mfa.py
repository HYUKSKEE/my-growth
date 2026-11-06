"""POST /api/garmin/mfa  {code} → {status: "ok"}"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # api/ → _common 임포트

from garminconnect import Garmin
from garminconnect.exceptions import GarminConnectAuthenticationError

from _common import ApiError, JsonHandler, start_first_sync, user_client


class handler(JsonHandler):
    def process(self, body, headers):
        sb = user_client(headers)
        code = str(body.get("code", "")).strip()
        if not code:
            raise ApiError(400, "MFA 코드를 입력하세요.")

        state = sb.rpc("get_mfa_state").execute().data
        if not state:
            raise ApiError(410, "로그인 시간이 만료되었습니다. 처음부터 다시 시도하세요.")

        g = Garmin(return_on_mfa=True)
        try:
            g.client.resume_login(state, code)
        except GarminConnectAuthenticationError:
            # 틀린 코드는 상태가 유지되므로 같은 화면에서 재시도 가능
            raise ApiError(401, "MFA 코드가 올바르지 않습니다.")

        sb.rpc("set_garmin_tokens", {"p_tokens": g.client.dumps()}).execute()
        sb.rpc("clear_mfa_state").execute()
        return {"status": "ok", "syncing": start_first_sync(sb)}
