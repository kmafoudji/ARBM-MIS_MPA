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
from django.contrib.auth import login, logout
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.shortcuts import redirect

from apps.identity.models import RoleAssignment
from apps.identity.services import get_user_permissions

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

    # Rattachement par EMAIL et non par username. Chercher par username creait
    # un doublon des qu'un compte local existait deja pour la meme personne
    # (createsuperuser "mafoudji.kande" vs SSO "mafoudji.kande@..."), avec deux
    # enregistrements portant la meme adresse et des droits differents.
    # L'email est desormais unique (AppUser.email), ce rattachement est donc sur.
    user = User.objects.filter(email__iexact=email).first()
    created = user is None

    if created:
        user = User.objects.create(
            username=email,
            email=email,
            first_name=name,
            auth_method="sso",
            idp_subject=subject,
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
    elif user.idp_subject != subject:
        user.idp_subject = subject
        user.auth_method = "sso"
        user.save(update_fields=["idp_subject", "auth_method"])

    login(request, user)
    return redirect(settings.FRONTEND_URL)


def me_view(request):
    """
    Retourne l'utilisateur connecte, ses roles et ses permissions effectives.
    Le frontend s'en sert pour n'afficher que les actions reellement
    autorisees (les vues DRF re-verifient cote serveur — l'UI n'est jamais
    la barriere de securite).
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Non authentifie."}, status=401)

    roles = list(
        RoleAssignment.objects.filter(user=request.user, revoked_at__isnull=True)
        .select_related("role")
        .values_list("role__label", flat=True)
    )

    return JsonResponse(
        {
            "email": request.user.email,
            "name": request.user.first_name,
            "is_superuser": request.user.is_superuser,
            "roles": roles,
            "permissions": sorted(get_user_permissions(request.user)),
        }
    )


def local_login_view(request):
    """
    POST /auth/login/local/ — connexion par email + mot de passe.
    Utilisé pour les comptes locaux (admin technique, tests).
    Les comptes SSO doivent passer par /auth/login/ (Entra ID).
    """
    import json
    from django.contrib.auth import authenticate, login as auth_login

    if request.method != "POST":
        return JsonResponse({"error": "Method not allowed."}, status=405)

    try:
        data = json.loads(request.body)
    except Exception:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return JsonResponse({"error": "Email and password are required."}, status=400)

    # Django authenticate via username (AppUser.username == email à la création)
    user = authenticate(request, username=email, password=password)
    if user is None:
        # Essai via email directement (cas où username != email)
        try:
            candidate = User.objects.get(email__iexact=email)
            user = authenticate(request, username=candidate.username, password=password)
        except User.DoesNotExist:
            pass

    if user is None or not user.is_active:
        return JsonResponse({"error": "Invalid email or password."}, status=401)

    auth_login(request, user)
    return JsonResponse({"ok": True})


def logout_view(request):
    """Termine la session locale (revocation immediate, RG-3.3)."""
    logout(request)
    return redirect(settings.FRONTEND_URL)
