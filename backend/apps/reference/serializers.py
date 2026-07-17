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

    class Meta:
        model = ImplementingAgency
        fields = [
            "id", "code", "name", "agency_type", "agency_type_display",
            "country", "country_name", "country_iso2", "flag", "logo_url",
            "is_active", "usage_count",
        ]

    def get_usage_count(self, obj):
        # Aucun projet ne reference encore d'agence d'implementation :
        # le referentiel existe, le lien vers Project reste a construire.
        return 0


class SectorSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source="parent.name", read_only=True)
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Sector
        fields = [
            "id", "code", "name", "parent", "parent_name", "icon", "color",
            "is_active", "usage_count",
        ]

    def get_usage_count(self, obj):
        # Primaire ET contributif : les deux comptent comme un usage.
        return obj.projects_as_primary.count() + obj.projects.count()


class SdgSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sdg
        fields = ["number", "name", "color"]
