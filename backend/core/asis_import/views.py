"""
Endpoint unique d'import AS-IS (design §5, §11).

Les deux modes executent la MEME analyse ; seul l'appel a `apply` les
distingue. Un rapport de validation ne peut donc pas differer de ce qu'un
commit ferait — c'est la propriete qui rend l'ecran "verifier puis
confirmer" digne de confiance.

Securite : on raisonne comme `core/uploads.py`. Le Content-Type annonce par
le client est declaratif ; on verifie les premiers octets du fichier
lui-meme. Un xlsx est une archive ZIP, donc `PK\\x03\\x04`.
"""
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import HasModulePermission

from .applier import apply as apply_plan
from .parser import compute_sha256, parse

# Un xlsx est un ZIP. Signature verifiee sur le contenu, pas sur l'annonce.
ZIP_MAGIC = b"PK\x03\x04"

# Les fichiers reels pesent ~35 Ko ; 5 Mo laisse toute la marge utile sans
# offrir de surface a un televersement abusif.
MAX_BYTES = 5 * 1024 * 1024

MODE_VALIDATE = "validate"
MODE_COMMIT = "commit"


class AsisImportView(APIView):
    """
    POST /api/import/asis/  (multipart : `file`, `mode`, `expected_sha256`)

    - 200 (validate) : rapport complet, rien n'est ecrit
    - 200 (commit)   : meme rapport + committed / project_id
    - 409            : `expected_sha256` ne correspond pas au fichier recu
    - 422            : le plan porte des erreurs, rien n'est ecrit
    """

    permission_classes = [IsAuthenticated, HasModulePermission]
    permission_module = "m1_config_access"
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "Aucun fichier recu (champ attendu : `file`)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        mode = (request.data.get("mode") or MODE_VALIDATE).strip().lower()
        if mode not in (MODE_VALIDATE, MODE_COMMIT):
            return Response(
                {"detail": f"mode invalide : {mode!r}. Attendu : validate ou commit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if upload.size > MAX_BYTES:
            return Response(
                {
                    "detail": f"Fichier trop volumineux ({upload.size / 1024 / 1024:.1f} Mo). "
                    f"Maximum : {MAX_BYTES // 1024 // 1024} Mo."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        head = upload.read(4)
        upload.seek(0)
        if head != ZIP_MAGIC:
            return Response(
                {
                    "detail": "Le contenu du fichier n'est pas un classeur xlsx "
                    "(signature ZIP absente). Televersement refuse."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # D-4 : l'echo de hash ferme le trou ouvert par l'absence de stockage
        # cote serveur (D-3) — valider le fichier A puis confirmer le B.
        # Le serveur recalcule ; il ne fait pas confiance a la valeur recue.
        digest = compute_sha256(upload)
        if mode == MODE_COMMIT:
            expected = (request.data.get("expected_sha256") or "").strip().lower()
            if not expected:
                return Response(
                    {"detail": "expected_sha256 est obligatoire en mode commit."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if expected != digest:
                return Response(
                    {
                        "detail": "Le fichier recu ne correspond pas a celui qui a ete valide. "
                        "Rien n'a ete ecrit ; relancez la validation.",
                        "file_sha256": digest,
                        "expected_sha256": expected,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        try:
            plan = parse(upload)
        except Exception as exc:  # noqa: BLE001 — un classeur illisible n'est pas une erreur 500
            return Response(
                {"detail": f"Classeur illisible : {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if plan.has_errors:
            return Response(plan.to_dict(), status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        if mode == MODE_COMMIT:
            apply_plan(plan, actor=request.user)

        return Response(plan.to_dict(), status=status.HTTP_200_OK)
