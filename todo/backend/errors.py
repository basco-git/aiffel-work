"""저장소 계층과 API가 함께 쓰는 예외. app.py에서 HTTP 상태 코드로 바뀐다."""


class BadRequest(Exception):      # 400
    pass


class Unauthorized(Exception):    # 401
    pass


class NotFound(Exception):        # 404
    pass


class Conflict(Exception):        # 409
    pass


class Upstream(Exception):        # 502: Supabase 응답 오류
    pass
