from rest_framework import serializers

from .models import Country, Donor, ImplementingAgency, RegionalHub, Sdg, Sector


class CountrySerializer(serializers.ModelSerializer):
    flag = serializers.CharField(read_only=True)
    hub_name = serializers.CharField(source="hub.name", read_only=True)
    hub_color = serializers.CharField(source="hub.color", read_only=True)

    class Meta:
        model = Country
        fields = [
            "id", "iso2", "iso3", "name", "flag",
            "hub", "hub_name", "hub_color", "is_fragile",
        ]


class CountryChipSerializer(serializers.ModelSerializer):
    """Version compacte, imbriquee dans les hubs."""

    flag = serializers.CharField(read_only=True)

    class Meta:
        model = Country
        fields = ["id", "iso2", "name", "flag"]


class RegionalHubSerializer(serializers.ModelSerializer):
    countries = CountryChipSerializer(many=True, read_only=True)
    country_count = serializers.SerializerMethodField()

    class Meta:
        model = RegionalHub
        fields = ["id", "code", "name", "city", "color", "countries", "country_count"]

    def get_country_count(self, obj):
        return obj.countries.count()


class DonorSerializer(serializers.ModelSerializer):
    flag = serializers.CharField(read_only=True)
    donor_type_display = serializers.CharField(source="get_donor_type_display", read_only=True)

    class Meta:
        model = Donor
        fields = [
            "id", "code", "short_name", "name", "donor_type", "donor_type_display",
            "origin_iso2", "flag", "color", "committed_amount_usd",
        ]


class ImplementingAgencySerializer(serializers.ModelSerializer):
    flag = serializers.CharField(read_only=True)
    country_name = serializers.CharField(source="country.name", read_only=True)
    agency_type_display = serializers.CharField(source="get_agency_type_display", read_only=True)

    class Meta:
        model = ImplementingAgency
        fields = [
            "id", "code", "name", "agency_type", "agency_type_display",
            "country", "country_name", "flag",
        ]


class SectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sector
        fields = ["id", "code", "name", "parent"]


class SdgSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sdg
        fields = ["number", "name"]
