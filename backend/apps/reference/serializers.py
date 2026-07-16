from rest_framework import serializers

from .models import Country, Sdg, Sector


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ["id", "iso2", "iso3", "name", "hub"]


class SectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sector
        fields = ["id", "code", "name", "parent"]


class SdgSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sdg
        fields = ["number", "name"]
