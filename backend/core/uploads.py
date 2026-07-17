"""
Televersement de fichiers (logos des bailleurs et agences, pieces jointes).

Passe systematiquement par `default_storage` : le meme code ecrit sur le
disque en local et sur Azure Blob Storage en production, sans modification.

SECURITE — pourquoi le SVG est refuse
-------------------------------------
Le SVG serait pourtant le format ideal pour un logo (vectoriel, net a toute
taille). Il est refuse parce qu'un SVG est un document XML pouvant embarquer
du JavaScript. Servi depuis l'origine du backend — celle qui porte le cookie
de session — un SVG malveillant ouvert directement executerait son script
dans ce contexte : vol de session.

Le televersement est deja reserve aux roles de confiance (aRBM Specialist,
Data & Digital Analyst), mais une plateforme IsDB merite une defense en
profondeur : on ne se repose pas sur la seule confiance accordee au role.

Pour accepter le SVG plus tard, deux voies : assainir le contenu (librairie
de sanitization XML) ou servir les medias depuis une origine distincte
(ce que fait naturellement Blob Storage en production).
"""
import uuid
from pathlib import Path

from django.core.files.storage import default_storage
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import HasModulePermission

# Formats matriciels uniquement. Voir la note de securite ci-dessus.
ALLOWED_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAX_BYTES = 2 * 1024 * 1024  # 2 Mo : largement suffisant pour un logo

# Signatures binaires. Le Content-Type annonce par le client est declaratif :
# n'importe qui peut envoyer un executable en pretendant que c'est un PNG.
# On verifie donc les premiers octets du fichier lui-meme.
MAGIC_NUMBERS = {
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/webp": [b"RIFF"],  # RIFF....WEBP
}


def _looks_like(content_type, head):
    if content_type == "image/webp":
        return head.startswith(b"RIFF") and head[8:12] == b"WEBP"
    return any(head.startswith(sig) for sig in MAGIC_NUMBERS[content_type])


class LogoUploadView(APIView):
    """
    POST /api/uploads/logo/  (multipart : champ `file`)
    -> { "url": "/media/logos/<uuid>.png" }

    L'URL retournee est destinee au champ `logo_url` du bailleur ou de
    l'agence. Le lien entre le fichier et l'enregistrement n'est pas
    materialise en base : changer un logo laisse l'ancien fichier orphelin.
    Acceptable a ce stade (volume marginal), a traiter par une tache de
    nettoyage si le besoin apparait.
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

        if upload.size > MAX_BYTES:
            return Response(
                {
                    "detail": f"Fichier trop volumineux ({upload.size / 1024 / 1024:.1f} Mo). "
                    f"Maximum : {MAX_BYTES // 1024 // 1024} Mo."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        if content_type not in ALLOWED_TYPES:
            return Response(
                {
                    "detail": "Format non accepte. Formats autorises : PNG, JPEG, WebP. "
                    "Le SVG est refuse pour des raisons de securite (il peut "
                    "embarquer du code executable)."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        head = upload.read(16)
        upload.seek(0)
        if not _looks_like(content_type, head):
            return Response(
                {
                    "detail": "Le contenu du fichier ne correspond pas au format "
                    "annonce. Televersement refuse."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Nom genere : neutralise toute tentative de traversee de repertoire
        # (../../) ou de collision, et n'expose pas le nom d'origine.
        ext = ALLOWED_TYPES[content_type]
        stem = Path(upload.name).stem[:40]
        safe_stem = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in stem).strip("-")
        filename = f"logos/{safe_stem or 'logo'}-{uuid.uuid4().hex[:8]}{ext}"

        saved_path = default_storage.save(filename, upload)

        return Response(
            {"url": default_storage.url(saved_path), "path": saved_path},
            status=status.HTTP_201_CREATED,
        )
