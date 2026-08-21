"""
Single AS-IS import endpoint (design §5, §11).

Both modes run the SAME parse; only the call to `apply` separates them. A
validation report therefore cannot differ from what a commit would do —
which is the property that makes the "review then confirm" screen worth
trusting.

Security: the reasoning follows `core/uploads.py`. The Content-Type the
client announces is declarative; what gets checked is the leading bytes of
the file itself. An xlsx is a ZIP archive, hence `PK\\x03\\x04`.
"""
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import HasModulePermission

from .applier import apply as apply_plan
from .parser import compute_sha256, parse

# An xlsx is a ZIP. Signature checked on the content, not on the claim.
ZIP_MAGIC = b"PK\x03\x04"

# The real files weigh ~35 KB; 5 MB leaves all the useful headroom without
# offering a surface for an abusive upload.
MAX_BYTES = 5 * 1024 * 1024

MODE_VALIDATE = "validate"
MODE_COMMIT = "commit"


class AsisImportView(APIView):
    """
    POST /api/import/asis/  (multipart: `file`, `mode`, `expected_sha256`)

    - 200 (validate): full report, nothing is written
    - 200 (commit)  : same report plus committed / project_id
    - 409           : `expected_sha256` does not match the uploaded file
    - 422           : the plan carries errors, nothing is written
    """

    permission_classes = [IsAuthenticated, HasModulePermission]
    permission_module = "m1_config_access"
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "No file received (expected field: `file`)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mode = (request.data.get("mode") or MODE_VALIDATE).strip().lower()
        if mode not in (MODE_VALIDATE, MODE_COMMIT):
            return Response(
                {"detail": f"Invalid mode: {mode!r}. Expected: validate or commit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if upload.size > MAX_BYTES:
            return Response(
                {
                    "detail": f"File too large ({upload.size / 1024 / 1024:.1f} MB). "
                    f"Maximum: {MAX_BYTES // 1024 // 1024} MB."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        head = upload.read(4)
        upload.seek(0)
        if head != ZIP_MAGIC:
            return Response(
                {
                    "detail": "This file is not an xlsx workbook (no ZIP signature). "
                    "Upload refused."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # D-4: the hash echo closes the hole opened by storing nothing on the
        # server (D-3) — validate file A, then confirm file B. The server
        # recomputes; it does not trust the value it receives.
        digest = compute_sha256(upload)
        if mode == MODE_COMMIT:
            expected = (request.data.get("expected_sha256") or "").strip().lower()
            if not expected:
                return Response(
                    {"detail": "expected_sha256 is required in commit mode."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if expected != digest:
                return Response(
                    {
                        "detail": "The file received is not the one that was validated. "
                        "Nothing was written; run the validation again.",
                        "file_sha256": digest,
                        "expected_sha256": expected,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        try:
            plan = parse(upload)
        except Exception as exc:  # noqa: BLE001 — an unreadable workbook is not a 500
            return Response(
                {"detail": f"Unreadable workbook: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if plan.has_errors:
            return Response(plan.to_dict(), status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        if mode == MODE_COMMIT:
            apply_plan(plan, actor=request.user)

        return Response(plan.to_dict(), status=status.HTTP_200_OK)
