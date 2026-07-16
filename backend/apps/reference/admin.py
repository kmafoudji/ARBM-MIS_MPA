from django.contrib import admin

from .models import Country, Currency, Donor, GadmArea, Marker, RegionalHub, Sdg, SdgTarget, Sector


@admin.register(Currency)
class CurrencyAdmin(admin.ModelAdmin):
    list_display = ("code", "name")


@admin.register(RegionalHub)
class RegionalHubAdmin(admin.ModelAdmin):
    list_display = ("code", "name")


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ("iso3", "name", "hub", "is_fragile")
    list_filter = ("hub", "is_fragile")


@admin.register(GadmArea)
class GadmAreaAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "level", "parent")
    list_filter = ("country", "level")


@admin.register(Donor)
class DonorAdmin(admin.ModelAdmin):
    list_display = ("code", "name")


@admin.register(Sector)
class SectorAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "parent")


@admin.register(Sdg)
class SdgAdmin(admin.ModelAdmin):
    list_display = ("number", "name")


@admin.register(SdgTarget)
class SdgTargetAdmin(admin.ModelAdmin):
    list_display = ("code", "sdg", "description")


@admin.register(Marker)
class MarkerAdmin(admin.ModelAdmin):
    list_display = ("code", "name")
