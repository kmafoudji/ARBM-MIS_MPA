"""
Factories Factory Boy pour les tests ARBM-MES.
Génèrent des objets en base avec des valeurs sensées par défaut,
en reflétant fidèlement le comportement réel de l'application.
"""
import factory
from factory.django import DjangoModelFactory


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

class UserFactory(DjangoModelFactory):
    """
    Utilisateur superuser — bypass RBAC applicatif en test.
    AppUser étend AbstractUser : username requis en premier argument positionnel
    de create_user().
    """
    class Meta:
        model = "identity.AppUser"

    username    = factory.Sequence(lambda n: f"user{n}")
    email       = factory.Sequence(lambda n: f"user{n}@test.arbm.org")
    first_name  = factory.Sequence(lambda n: f"User{n}")
    last_name   = "Test"
    user_type   = "internal"
    auth_method = "password"
    is_active   = True
    is_superuser = True   # → get_user_permissions() retourne {"*"} (bypass RBAC)
    is_staff     = True   # → accès Django admin si besoin

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("password", "testpass123")
        return model_class.objects.create_user(
            username=kwargs.pop("username"),
            email=kwargs.pop("email"),
            password=password,
            **kwargs,
        )


# ---------------------------------------------------------------------------
# Référentiel
# ---------------------------------------------------------------------------

class HubFactory(DjangoModelFactory):
    class Meta:
        model = "reference.RegionalHub"

    code = factory.Sequence(lambda n: f"hub{n}")
    name = factory.Sequence(lambda n: f"Hub {n}")
    city = "Dakar"


class CountryFactory(DjangoModelFactory):
    """
    iso2 sur 2 lettres majuscules — séquence alphabétique pour éviter les
    doublons même avec > 26 pays créés dans la même suite de tests.
    """
    class Meta:
        model = "reference.Country"

    iso2 = factory.Sequence(lambda n: f"{chr(65 + (n // 26) % 26)}{chr(65 + n % 26)}")
    iso3 = factory.Sequence(lambda n: f"T{chr(65 + (n // 26) % 26)}{chr(65 + n % 26)}")
    name = factory.Sequence(lambda n: f"Country {n}")
    hub  = factory.SubFactory(HubFactory)


class SectorFactory(DjangoModelFactory):
    class Meta:
        model = "reference.Sector"

    code = factory.Sequence(lambda n: f"sector{n}")
    name = factory.Sequence(lambda n: f"Sector {n}")
    icon = "generic"


class SdgFactory(DjangoModelFactory):
    """Les 17 ODD sont idempotents — get_or_create sur number."""
    class Meta:
        model = "reference.Sdg"
        django_get_or_create = ("number",)

    number = factory.Sequence(lambda n: (n % 17) + 1)
    name   = factory.LazyAttribute(lambda o: f"SDG {o.number}")
    color  = "#FFFFFF"


class CurrencyFactory(DjangoModelFactory):
    """
    Currency.code est la clé primaire (ex. "USD").
    get_or_create pour éviter les doublons entre tests.
    """
    class Meta:
        model = "reference.Currency"
        django_get_or_create = ("code",)

    code = "USD"
    name = "US Dollar"


# ---------------------------------------------------------------------------
# Projet
# ---------------------------------------------------------------------------

class ProjectFactory(DjangoModelFactory):
    """
    Projet minimal avec un pays et un secteur par défaut.
    skip_postgeneration_save=True évite le double save() inutile après
    le post_generation 'countries' (factory-boy >= 3.3 deprecation).
    """
    class Meta:
        model = "project.Project"
        skip_postgeneration_save = True

    name            = factory.Sequence(lambda n: f"Test Project {n}")
    official_reference_number = factory.Sequence(lambda n: f"TST{n:04d}")
    lifecycle_stage = "concept_note"
    primary_sector  = factory.SubFactory(SectorFactory)
    created_by      = factory.SubFactory(UserFactory)

    @factory.post_generation
    def countries(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            from apps.project.services import set_project_countries
            country_ids = [c.id for c in extracted]
            set_project_countries(self, country_ids, country_ids[0])
        else:
            country = CountryFactory()
            from apps.project.services import set_project_countries
            set_project_countries(self, [country.id], country.id)


class ProjectFinancialEnvelopeFactory(DjangoModelFactory):
    """
    Enveloppe financière d'un projet.
    En production elle est créée à la demande via get_or_create au premier
    GET /envelope/ — cette factory la crée directement en base pour les tests
    qui ont besoin d'y ajouter des sources sans passer par l'API.
    """
    class Meta:
        model = "project.ProjectFinancialEnvelope"
        django_get_or_create = ("project",)

    project = factory.SubFactory(ProjectFactory)
    notes   = ""
