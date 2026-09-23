from django.contrib import admin

from .models import (
    Country,
    CrossCuttingTheme,
    Currency,
    Donor,
    GadmArea,
    ImplementingAgency,
    Marker,
    RegionalHub,
    Sdg,
    SdgTarget,
    Sector,
)


@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    list_display = ("code", "name")


@admin.register(RegionalHub)
class RegionalHubAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "city", "color")


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ("flag", "iso3", "name", "hub", "is_fragile")
    list_filter = ("hub", "is_fragile")
    search_fields = ("name", "iso2", "iso3")


@admin.register(GadmArea)
class GadmAreaAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "level", "parent")
    list_filter = ("country", "level")


@admin.register(Donor)
class DonorAdmin(admin.ModelAdmin):
    list_display = ("flag", "short_name", "name", "donor_type", "committed_amount_usd")
    list_filter = ("donor_type",)


@admin.register(ImplementingAgency)
class ImplementingAgencyAdmin(admin.ModelAdmin):
    list_display = ("flag", "name", "agency_type", "country")
    list_filter = ("agency_type", "country")
    search_fields = ("name", "code")


@admin.register(Sector)
class SectorAdmin(admin.ModelAdmin):
    list_display = ("taxonomy", "sequence", "code", "name", "parent")
    list_filter = ("taxonomy",)


@admin.register(Sdg)
class SdgAdmin(admin.ModelAdmin):
    list_display = ("number", "name")


@admin.register(SdgTarget)
class SdgTargetAdmin(admin.ModelAdmin):
    list_display = ("code", "sdg", "description")


@admin.register(Marker)
class MarkerAdmin(admin.ModelAdmin):
    list_display = ("code", "name")


@admin.register(CrossCuttingTheme)
class CrossCuttingThemeAdmin(admin.ModelAdmin):
    list_display = ("code", "name")
