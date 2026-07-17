from rest_framework.routers import DefaultRouter

from .views import (
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
router.register("sdgs", SdgViewSet, basename="sdg")

urlpatterns = router.urls
