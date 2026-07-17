"""
Normalise le compte d'amorcage cree par `createsuperuser` en compte
technique explicite, distinct de toute identite personnelle.

POURQUOI
--------
`createsuperuser` cree un compte local (username + mot de passe). Si on lui
donne l'adresse professionnelle d'une personne reelle, deux comptes finissent
par porter la meme identite :

  - le compte local        username="mafoudji.kande"
  - le compte SSO Entra ID username="mafoudji.kande@millenniumpromise.org"

...tous deux avec email="mafoudji.kande@millenniumpromise.org". Django
n'empeche pas ce doublon (AbstractUser.email n'est pas unique), d'ou la
confusion : on croit se connecter avec ses droits d'administrateur alors
qu'on utilise un tout autre enregistrement.

CE QUE FAIT LA COMMANDE
-----------------------
1. Deplace le compte d'amorcage vers une identite technique
   (admin.local / admin@arbm-mes.local par defaut) ;
2. Retire ses attributions de role, qui n'ont aucun effet sur un superuser
   (get_user_permissions() lui accorde deja toutes les permissions) et ne
   font qu'entretenir l'illusion d'un profil metier ;
3. Signale tout autre doublon d'email restant.

A LANCER AVANT la migration qui rend l'email unique, sinon celle-ci echouera
sur le doublon existant.

Usage :
    python manage.py normalize_admin_account
    python manage.py normalize_admin_account --username mafoudji.kande
    python manage.py normalize_admin_account --new-username admin.local \\
        --new-email admin@arbm-mes.local --no-input
"""
from collections import defaultdict

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.identity.models import RoleAssignment

User = get_user_model()

DEFAULT_NEW_USERNAME = "admin.local"
DEFAULT_NEW_EMAIL = "admin@arbm-mes.local"


class Command(BaseCommand):
    help = "Transforme le superuser d'amorcage en compte technique explicite."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            help="Username du compte a normaliser. Par defaut : le superuser local "
            "dont l'email entre en collision avec un compte SSO.",
        )
        parser.add_argument("--new-username", default=DEFAULT_NEW_USERNAME)
        parser.add_argument("--new-email", default=DEFAULT_NEW_EMAIL)
        parser.add_argument(
            "--keep-roles",
            action="store_true",
            help="Conserve les attributions de role du compte technique "
            "(sans effet reel : un superuser court-circuite le RBAC).",
        )
        parser.add_argument("--no-input", action="store_true", help="Ne pas demander confirmation.")

    def handle(self, *args, **opts):
        target = self._resolve_target(opts.get("username"))
        if target is None:
            return

        new_username = opts["new_username"]
        new_email = opts["new_email"]

        clash = User.objects.filter(username=new_username).exclude(pk=target.pk).first()
        if clash:
            raise CommandError(
                f"Le username '{new_username}' est deja pris (id={clash.pk}). "
                f"Utilisez --new-username pour en choisir un autre."
            )

        roles = list(
            RoleAssignment.objects.filter(user=target, revoked_at__isnull=True)
            .select_related("role")
            .values_list("role__label", flat=True)
        )

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Compte a normaliser"))
        self.stdout.write(f"  id           : {target.pk}")
        self.stdout.write(f"  username     : {target.username}  ->  {new_username}")
        self.stdout.write(f"  email        : {target.email or '(vide)'}  ->  {new_email}")
        self.stdout.write(f"  superuser    : {target.is_superuser}")
        self.stdout.write(f"  roles        : {', '.join(roles) or '(aucun)'}")
        if roles and not opts["keep_roles"]:
            self.stdout.write(
                self.style.WARNING(
                    "                 -> seront retires (sans effet sur un superuser)"
                )
            )
        self.stdout.write("")

        if not opts["no_input"]:
            if input("Confirmer ? [o/N] ").strip().lower() not in {"o", "oui", "y", "yes"}:
                self.stdout.write(self.style.WARNING("Annule. Aucune modification."))
                return

        with transaction.atomic():
            target.username = new_username
            target.email = new_email
            target.auth_method = "password"
            target.first_name = target.first_name or "Compte technique"
            target.last_name = ""
            target.idp_subject = ""
            target.save()

            removed = 0
            if roles and not opts["keep_roles"]:
                removed = RoleAssignment.objects.filter(user=target).delete()[0]

        self.stdout.write(self.style.SUCCESS(f"Compte technique : {new_username} / {new_email}"))
        if removed:
            self.stdout.write(self.style.SUCCESS(f"Attributions de role retirees : {removed}"))
        self.stdout.write(
            "  Ce compte sert desormais d'acces de secours a l'admin Django "
            "(username + mot de passe) si Entra ID est indisponible."
        )

        self._report_remaining_duplicates()

    # ------------------------------------------------------------------

    def _resolve_target(self, username):
        if username:
            try:
                return User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(f"Aucun utilisateur avec le username '{username}'.")

        # Detection automatique : un superuser local dont l'email est aussi
        # porte par un compte SSO.
        candidates = []
        for su in User.objects.filter(is_superuser=True).exclude(email=""):
            twin = (
                User.objects.filter(email__iexact=su.email)
                .exclude(pk=su.pk)
                .exclude(idp_subject="")
                .first()
            )
            if twin:
                candidates.append((su, twin))

        if not candidates:
            self.stdout.write(
                self.style.SUCCESS(
                    "Aucun doublon detecte : aucun superuser local ne partage son email "
                    "avec un compte SSO. Rien a faire."
                )
            )
            self._report_remaining_duplicates()
            return None

        if len(candidates) > 1:
            names = ", ".join(su.username for su, _ in candidates)
            raise CommandError(
                f"Plusieurs superusers en collision ({names}). "
                f"Precisez lequel avec --username."
            )

        su, twin = candidates[0]
        self.stdout.write(
            self.style.WARNING(
                f"Doublon detecte : '{su.username}' (local, superuser) et "
                f"'{twin.username}' (SSO) partagent l'email {su.email}."
            )
        )
        return su

    def _report_remaining_duplicates(self):
        by_email = defaultdict(list)
        for u in User.objects.exclude(email=""):
            by_email[u.email.lower()].append(u.username)
        dupes = {e: us for e, us in by_email.items() if len(us) > 1}

        blanks = User.objects.filter(email="").count()

        if dupes:
            self.stdout.write("")
            self.stdout.write(
                self.style.ERROR(
                    "Doublons d'email restants — la migration d'unicite echouera :"
                )
            )
            for email, usernames in dupes.items():
                self.stdout.write(f"  {email} : {', '.join(usernames)}")
        if blanks:
            self.stdout.write("")
            self.stdout.write(
                self.style.ERROR(
                    f"{blanks} compte(s) sans email — a corriger avant la migration "
                    f"d'unicite (les chaines vides entrent en collision entre elles)."
                )
            )
        if not dupes and not blanks:
            self.stdout.write("")
            self.stdout.write(
                self.style.SUCCESS("Emails tous uniques et renseignes : migration possible.")
            )
