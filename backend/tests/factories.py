"""
Factories Factory Boy pour les tests ARBM-MES.
Génèrent des objets en base avec des valeurs sensées par défaut.
"""
import factory
from factory.django import DjangoModelFactory
from django.utils import timezone


class UserFactory(DjangoModelFactory):
    class Meta:
        model = "identity.AppUser"

    username = factory.Sequence(lambda n: f"user{n}")
    email    = factory.Sequence(lambda n: f"user{n}@test.arbm.org")
    first_name = factory.Sequence(lambda n: f"User{n}")
    last_name  = "Test"
    user_type   = "internal"
    auth_method = "password"
    is_active   = True
    is_superuser = True  # Bypass RBAC en test (check_transition_authorization)
    is_staff     = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("password", "testpass123")
        return model_class.objects.create_user(
            username=kwargs.pop("username"),
            email=kwargs.pop("email"),
            password=password,
            **kwargs,
        )


class HubFactory(DjangoModelFactory):
    class Meta:
        model = "reference.RegionalHub"

    code = factory.Sequence(lambda n: f"hub{n}")
    name = factory.Sequence(lambda n: f"Hub {n}")
    city = "Dakar"


class CountryFactory(DjangoModelFactory):
    class Meta:
        model = "reference.Country"

    iso2 = factory.Sequence(lambda n: f"T{n % 26:01X}"[:2])
    iso3 = factory.Sequence(lambda n: f"TS{n % 26:01X}"[:3])
    name = factory.Sequence(lambda n: f"Country {n}")
    hub = factory.SubFactory(HubFactory)


class SectorFactory(DjangoModelFactory):
    class Meta:
        model = "reference.Sector"

    code = factory.Sequence(lambda n: f"sector{n}")
    name = factory.Sequence(lambda n: f"Sector {n}")
    icon = "generic"


class SdgFactory(DjangoModelFactory):
    class Meta:
        model = "reference.Sdg"
        django_get_or_create = ("number",)

    number = factory.Sequence(lambda n: (n % 17) + 1)
    name = factory.LazyAttribute(lambda o: f"SDG {o.number}")
    color = "#FFFFFF"


class CurrencyFactory(DjangoModelFactory):
    class Meta:
        model = "reference.Currency"
        django_get_or_create = ("code",)

    code = "USD"
    name = "US Dollar"
    symbol = "$"


class ProjectFactory(DjangoModelFactory):
    class Meta:
        model = "project.Project"

    name = factory.Sequence(lambda n: f"Test Project {n}")
    lifecycle_stage = "concept_note"
    primary_sector = factory.SubFactory(SectorFactory)
    created_by = factory.SubFactory(UserFactory)

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
