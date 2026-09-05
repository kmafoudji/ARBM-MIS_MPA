from rest_framework import serializers

from .models import Country, Currency, Donor, ImplementingAgency, RegionalHub, Sdg, Sector


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = ["code", "name"]


class CountrySerializer(serializers.ModelSerializer):
    flag = serializers.CharField(read_only=True)
    hub_name = serializers.CharField(source="hub.name", read_only=True)
    hub_color = serializers.CharField(source="hub.color", read_only=True)
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Country
        fields = [
            "id", "iso2", "iso3", "name", "flag",
            "hub", "hub_name", "hub_color", "is_fragile",
            "is_active", "usage_count",
        ]

    def get_usage_count(self, obj):
        return obj.projects.count()


class CountryChipSerializer(serializers.ModelSerializer):
    """Version compacte, imbriquee dans les hubs."""

    flag = serializers.CharField(read_only=True)

    class Meta:
        model = Country
        fields = ["id", "iso2", "name", "flag"]


class RegionalHubSerializer(serializers.ModelSerializer):
    countries = CountryChipSerializer(many=True, read_only=True)
    country_count = serializers.SerializerMethodField()

    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = RegionalHub
        fields = [
            "id", "code", "name", "city", "color",
            "countries", "country_count", "is_active", "usage_count",
        ]

    def get_country_count(self, obj):
        return obj.countries.count()

    def get_usage_count(self, obj):
        return obj.projects.count()


class DonorSerializer(serializers.ModelSerializer):
    flag = serializers.CharField(read_only=True)
    donor_type_display = serializers.CharField(source="get_donor_type_display", read_only=True)
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Donor
        fields = [
            "id", "code", "short_name", "name", "donor_type", "donor_type_display",
            "origin_iso2", "flag", "color", "logo_url", "committed_amount_usd",
            "is_active", "usage_count",
        ]

    def get_usage_count(self, obj):
        return obj.projects.count()


class ImplementingAgencySerializer(serializers.ModelSerializer):
    flag = serializers.CharField(read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    country_iso2 = serializers.CharField(source="country.iso2", read_only=True)
    usage_count = serializers.SerializerMethodField()
    agency_type_display = serializers.CharField(source="get_agency_type_display", read_only=True)
    # code est optionnel a la saisie : auto-genere si absent
    code = serializers.SlugField(required=False)

    class Meta:
        model = ImplementingAgency
        fields = [
            "id", "code", "name", "agency_type", "agency_type_display",
            "country", "country_name", "country_iso2", "flag", "logo_url",
            "is_active", "usage_count",
        ]

    def get_usage_count(self, obj):
        return getattr(obj, "_usage_count", 0)

    @staticmethod
    def _generate_code(name, country_iso2=None):
        """Genere un slug unique a partir du nom : type-iso2 ou sigle."""
        import re, unicodedata
        # Normaliser : supprimer accents, minuscules, remplacer espaces/ponctuation par -
        nfkd = unicodedata.normalize("NFKD", name)
        ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
        slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
        # Limiter a 30 caracteres utiles
        slug = slug[:28]
        if country_iso2:
            slug = f"{slug[:24]}-{country_iso2.lower()}"
        # Garantir l'unicite en suffixant si collision
        from apps.reference.models import ImplementingAgency as IA
        base = slug
        n = 1
        while IA.objects.filter(code=slug).exists():
            slug = f"{base[:26]}-{n}"
            n += 1
        return slug

    def validate(self, data):
        # Auto-generer le code si absent
        if not data.get("code"):
            country = data.get("country")
            iso2 = country.iso2 if country else None
            data["code"] = self._generate_code(data.get("name", "agency"), iso2)
        return data


class CrossCuttingThemeSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.reference.models import CrossCuttingTheme
        model = CrossCuttingTheme
        fields = ["id", "code", "name"]

class SectorSerializer(serializers.ModelSerializer):
    """Two-level taxonomy (ADR 0007): `parent` null = pillar, otherwise sector.

    `is_pillar` and `pillar_name` let the frontend group and label without
    walking the list itself.
    """

    parent_name = serializers.CharField(source="parent.name", read_only=True)
    is_pillar = serializers.SerializerMethodField()
    pillar_name = serializers.SerializerMethodField()
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Sector
        fields = [
            "id", "code", "name", "sequence", "parent", "parent_name",
            "is_pillar", "pillar_name", "icon", "color",
            "is_active", "usage_count",
        ]

    def get_is_pillar(self, obj):
        return obj.parent_id is None

    def get_pillar_name(self, obj):
        return obj.parent.name if obj.parent_id else obj.name

    def get_usage_count(self, obj):
        # Primaire ET contributif : les deux comptent comme un usage.
        return obj.projects_as_primary.count() + obj.projects.count()


class SdgSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sdg
        fields = ["number", "name", "color"]


class GadmAreaSerializer(serializers.ModelSerializer):
    children_count = serializers.SerializerMethodField()

    class Meta:
        from apps.reference.models import GadmArea
        model = GadmArea
        fields = ["id", "gadm_uid", "name", "name_alt", "level", "country", "parent", "children_count"]

    def get_children_count(self, obj):
        return obj.children.count()
