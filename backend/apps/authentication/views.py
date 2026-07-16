"""
Authentification via Microsoft Entra ID (Azure AD), tenant MillenniumPromise.

Ceci est un stub fonctionnel du flow OAuth2 Authorization Code avec MSAL,
a completer une fois l'App Registration creee dans Entra ID (client ID,
tenant ID et client secret places dans .env - voir .env.example).

Flow :
1. GET /auth/login/      -> redirige l'utilisateur vers Microsoft pour se connecter
2. GET /auth/callback/   -> Microsoft redirige ici avec un code, on l'echange
                             contre un token, puis on cree/connecte l'utilisateur Django
"""
import msal
from django.conf import settings
from django.contrib.auth import login
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.shortcuts import redirect

User = get_user_model()


def _msal_app():
    return msal.ConfidentialClientApplication(
        client_id=settings.ENTRA_CLIENT_ID,
        client_credential=settings.ENTRA_CLIENT_SECRET,
        authority=settings.ENTRA_AUTHORITY,
    )


def login_view(request):
    """Redirige vers la page de connexion Microsoft Entra ID."""
    if not settings.ENTRA_CLIENT_ID:
        return JsonResponse(
            {
                "error": "Entra ID non configure. "
                "Renseignez ENTRA_CLIENT_ID, ENTRA_TENANT_ID et "
                "ENTRA_CLIENT_SECRET dans le fichier .env."
            },
            status=501,
        )

    auth_url = _msal_app().get_authorization_request_url(
        scopes=settings.ENTRA_SCOPES,
        redirect_uri=settings.ENTRA_REDIRECT_URI,
    )
    return redirect(auth_url)


def callback_view(request):
    """Recoit le code d'autorisation de Microsoft et cree la session utilisateur."""
    code = request.GET.get("code")
    if not code:
        return JsonResponse({"error": "Code d'autorisation manquant."}, status=400)

    result = _msal_app().acquire_token_by_authorization_code(
        code=code,
        scopes=settings.ENTRA_SCOPES,
        redirect_uri=settings.ENTRA_REDIRECT_URI,
    )

    if "error" in result:
        return JsonResponse(result, status=400)

    claims = result.get("id_token_claims", {})
    email = claims.get("preferred_username") or claims.get("email")
    name = claims.get("name", "")
    subject = claims.get("sub", "")

    if not email:
        return JsonResponse(
            {"error": "Impossible de recuperer l'email depuis Entra ID."}, status=400
        )

    user, created = User.objects.get_or_create(
        username=email,
        defaults={
            "email": email,
            "first_name": name,
            "auth_method": "sso",
            "idp_subject": subject,
        },
    )
    if not created and user.idp_subject != subject:
        user.idp_subject = subject
        user.auth_method = "sso"
        user.save(update_fields=["idp_subject", "auth_method"])

    login(request, user)

    return JsonResponse({"status": "authenticated", "email": email})


def me_view(request):
    """Retourne l'utilisateur actuellement connecte (ou 401)."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Non authentifie."}, status=401)
    return JsonResponse(
        {
            "email": request.user.email,
            "name": request.user.first_name,
        }
    )
