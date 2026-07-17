from rest_framework.routers import DefaultRouter

from .views import (
    CurrencyViewSet,
    CountryViewSet,
    DonorViewSet,
    ImplementingAgencyViewSet,
    RegionalHubViewSet,
    SdgViewSet,
    SectorViewSet,
)

router = DefaultRouter()
router.register("countries", CountryViewSet, basename="country")
router.register("hubs", RegionalHubViewSet, basename="regionalhub")
router.register("donors", DonorViewSet, basename="donor")
router.register("agencies", ImplementingAgencyViewSet, basename="implementingagency")
router.register("sectors", SectorViewSet, basename="sector")
router.register("currencies", CurrencyViewSet, basename="currency")
router.register("sdgs", SdgViewSet, basename="sdg")

urlpatterns = router.urls
